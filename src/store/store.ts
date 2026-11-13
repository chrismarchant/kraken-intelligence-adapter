import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { CampaignRecord, Id } from "../contracts/index.ts";

export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`No campaign with id "${id}".`);
    this.name = "RecordNotFoundError";
  }
}

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
    return CampaignRecord.parse(JSON.parse(raw));
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
  /** A lock file older than this is taken to belong to a dead process and is removed. */
  staleLockMs?: number;
}

/**
 * One JSON file per campaign. No database.
 *
 * Writers in one process queue on an in-memory mutex. Writers in different processes
 * (for example the MCP server and the operator tool) queue on a lock file created with
 * exclusive-create. Each write goes to a uniquely named temporary file, is flushed to
 * disk, and is then renamed into place, so a reader never sees a partial file.
 */
export class FileCampaignStore implements CampaignStore {
  private readonly dir: string;
  private readonly mutex = new KeyedMutex();
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;

  constructor(dir: string, options: FileStoreOptions = {}) {
    this.dir = dir;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 15_000;
    this.staleLockMs = options.staleLockMs ?? 60_000;
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

  /** Hold the cross-process lock for a campaign while `task` runs. */
  private async locked<T>(id: string, task: () => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const lockPath = `${this.path(id)}.lock`;
    const deadline = Date.now() + this.lockTimeoutMs;
    let pause = 5;
    for (;;) {
      try {
        const handle = await open(lockPath, "wx", 0o600);
        await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
        await handle.close();
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (age > this.staleLockMs) {
          await unlink(lockPath).catch(() => undefined);
          continue;
        }
        if (Date.now() > deadline) throw new StoreBusyError(id);
        await new Promise((resolve) => setTimeout(resolve, pause));
        pause = Math.min(pause * 2, 100);
      }
    }
    try {
      return await task();
    } finally {
      await unlink(lockPath).catch(() => undefined);
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
      raw = await readFile(this.path(id), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new RecordNotFoundError(id);
      throw error;
    }
    return CampaignRecord.parse(JSON.parse(raw));
  }

  update<T>(id: string, change: (record: CampaignRecord) => T | Promise<T>): Promise<T> {
    return this.mutex.run(id, () =>
      this.locked(id, async () => {
        const record = await this.get(id);
        const result = await change(record);
        record.revision += 1;
        await this.write(record);
        return result;
      }),
    );
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
