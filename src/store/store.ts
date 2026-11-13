import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { CampaignRecord, Id } from "../contracts/index.ts";
import { acquireOwnedLock } from "./lock.ts";

export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`No campaign with id "${id}".`);
    this.name = "RecordNotFoundError";
  }
}

/** Internal: this writer's lock was displaced, or the record moved, before it could write. The update is run again. */
class LockLostError extends Error {}

export class StoreBusyError extends Error {
  constructor(id: string) {
    super(`Campaign "${id}" is locked by another writer and did not become free in time.`);
    this.name = "StoreBusyError";
  }
}

/**
 * Durable campaign state. KIC is the authority for briefs, decisions and approvals;
 * conversation memory in any agent runtime is not.
 *
 * `update` is the only way to change a stored record. It is serialised per campaign and
 * atomic: the change function sees the latest stored record, and either its whole result
 * is written or nothing is. Two concurrent updates can never both start from the same
 * revision, so neither can overwrite the other.
 */
export interface CampaignStore {
  create(record: CampaignRecord): Promise<void>;
  get(id: string): Promise<CampaignRecord>;
  /**
   * Apply `change` to the latest record and write it, incrementing the revision.
   * If `change` throws, nothing is written. Keep `change` short: it runs while the
   * campaign is locked, so it must not call a model or any other slow service.
   */
  update<T>(id: string, change: (record: CampaignRecord) => T | Promise<T>): Promise<T>;
  list(): Promise<string[]>;
}

export class RecordMismatchError extends Error {
  constructor(id: string, found: string) {
    super(`The stored record for campaign "${id}" says it is campaign "${found}". The store has been altered.`);
    this.name = "RecordMismatchError";
  }
}

/** A record must be the campaign it is filed as: a file copied over another campaign's is refused. */
function sameCampaign(id: string, record: CampaignRecord): CampaignRecord {
  if (record.id !== id) throw new RecordMismatchError(id, record.id);
  return record;
}

export { PROCESS_INSTANCE, startTimeOf } from "./lock.ts";

/** Runs tasks for the same key one after another, in arrival order. */
class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await next;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

export class MemoryCampaignStore implements CampaignStore {
  private readonly records = new Map<string, string>();
  private readonly mutex = new KeyedMutex();

  async create(record: CampaignRecord): Promise<void> {
    if (this.records.has(record.id)) throw new Error(`Campaign "${record.id}" already exists.`);
    this.records.set(record.id, JSON.stringify(CampaignRecord.parse(record)));
  }

  async get(id: string): Promise<CampaignRecord> {
    const raw = this.records.get(id);
    if (raw === undefined) throw new RecordNotFoundError(id);
    return sameCampaign(id, CampaignRecord.parse(JSON.parse(raw)));
  }

  update<T>(id: string, change: (record: CampaignRecord) => T | Promise<T>): Promise<T> {
    return this.mutex.run(id, async () => {
      const record = await this.get(id);
      const result = await change(record);
      record.revision += 1;
      this.records.set(id, JSON.stringify(CampaignRecord.parse(record)));
      return result;
    });
  }

  async list(): Promise<string[]> {
    return [...this.records.keys()].sort();
  }
}

export interface FileStoreOptions {
  /** How long to wait for another process to release a campaign. */
  lockTimeoutMs?: number;
  /** How old a lock with no readable owner must be before it is cleared. A lock that names a live process is never cleared. */
  staleLockMs?: number;
}

/**
 * One JSON file per campaign. No database.
 *
 * Writers in one process queue on an in-memory mutex. Writers in different processes
 * (for example the MCP server and the operator tool) queue on a lock file created with
 * exclusive-create, which names its owner. Each write goes to a uniquely named temporary
 * file, is flushed to disk, and is then renamed into place, so a reader never sees a
 * partial file. Processes sharing a store must run on the same machine.
 */
export class FileCampaignStore implements CampaignStore {
  private readonly dir: string;
  private readonly mutex = new KeyedMutex();
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;

  constructor(dir: string, options: FileStoreOptions = {}) {
    this.dir = dir;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 15_000;
    this.staleLockMs = options.staleLockMs ?? 10_000;
  }

  private path(id: string): string {
    // Ids are validated against a strict pattern, so they cannot contain path separators.
    return join(this.dir, `${Id.parse(id)}.json`);
  }

  private async write(record: CampaignRecord): Promise<void> {
    const target = this.path(record.id);
    const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
    const body = `${JSON.stringify(CampaignRecord.parse(record), null, 2)}\n`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Hold the cross-process lock for a campaign while `task` runs.
   *
   * The lock file names its owner: a process id and a random token. A lock is taken over
   * only when its owner is known to be gone (the process no longer exists), never because
   * it is old: a writer that is merely slow or paused keeps its lock, and others wait and
   * then report that the campaign is busy. On release, a writer removes the lock only if
   * it still carries its own token. How a dead owner's lock is removed, by exactly one
   * process, is in lock.ts.
   */
  private async locked<T>(id: string, task: (assertHeld: () => Promise<void>) => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const lock = await acquireOwnedLock(`${this.path(id)}.lock`, { timeoutMs: this.lockTimeoutMs, ownerlessAfterMs: this.staleLockMs });
    if (lock === null) throw new StoreBusyError(id);
    try {
      return await task(async () => {
        if (!(await lock.held())) throw new LockLostError();
      });
    } finally {
      // Only our own lock is removed. If it is no longer ours, it is left alone.
      await lock.release();
    }
  }

  create(record: CampaignRecord): Promise<void> {
    return this.mutex.run(record.id, () =>
      this.locked(record.id, async () => {
        try {
          await this.get(record.id);
        } catch (error) {
          if (error instanceof RecordNotFoundError) return this.write(record);
          throw error;
        }
        throw new Error(`Campaign "${record.id}" already exists.`);
      }),
    );
  }

  async get(id: string): Promise<CampaignRecord> {
    let raw: string;
    try {
      // A record is an ordinary file. A link put in its place is not followed: it could point
      // anywhere the server's user can read.
      // Opened without waiting: a named pipe put in its place would otherwise hold the caller for ever.
      const handle = await open(this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        if (!(await handle.stat()).isFile()) throw Object.assign(new Error("not a file"), { code: "ELOOP" });
        raw = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new RecordNotFoundError(id);
      if (code === "ELOOP") throw new Error(`Campaign "${id}" is not stored as an ordinary file.`);
      throw error;
    }
    return sameCampaign(id, CampaignRecord.parse(JSON.parse(raw)));
  }

  update<T>(id: string, change: (record: CampaignRecord) => T | Promise<T>): Promise<T> {
    return this.mutex.run(id, async () => {
      // If this writer's lock is displaced while several writers recover from a crashed one,
      // nothing has been written: the update is simply run again on the latest record.
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.locked(id, async (assertHeld) => {
            const record = await this.get(id);
            const revision = record.revision;
            const result = await change(record);
            record.revision += 1;
            // Last line of defence before the write: the lock must still be ours, and nothing
            // may have been written since we read.
            await assertHeld();
            if ((await this.get(id)).revision !== revision) throw new LockLostError();
            await this.write(record);
            return result;
          });
        } catch (error) {
          if (!(error instanceof LockLostError)) throw error;
          if (attempt >= 8) throw new StoreBusyError(id);
        }
      }
    });
  }

  async list(): Promise<string[]> {
    try {
      const names = await readdir(this.dir);
      return names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}
