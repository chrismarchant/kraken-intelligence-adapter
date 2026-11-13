import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CampaignRecord, Id } from "../contracts/index.ts";

export class RecordNotFoundError extends Error {
  constructor(id: string) {
    super(`No campaign with id "${id}".`);
    this.name = "RecordNotFoundError";
  }
}

export class RevisionConflictError extends Error {
  constructor(id: string, expected: number, actual: number) {
    super(`Campaign "${id}" changed since it was read (expected revision ${expected}, found ${actual}).`);
    this.name = "RevisionConflictError";
  }
}

/**
 * Durable campaign state. KIC is the authority for briefs, decisions and approvals;
 * conversation memory in any agent runtime is not.
 */
export interface CampaignStore {
  create(record: CampaignRecord): Promise<void>;
  get(id: string): Promise<CampaignRecord>;
  /** Writes `record` if the stored revision equals `record.revision - 1`. */
  put(record: CampaignRecord): Promise<void>;
  list(): Promise<string[]>;
}

export class MemoryCampaignStore implements CampaignStore {
  private readonly records = new Map<string, string>();

  async create(record: CampaignRecord): Promise<void> {
    if (this.records.has(record.id)) throw new Error(`Campaign "${record.id}" already exists.`);
    this.records.set(record.id, JSON.stringify(CampaignRecord.parse(record)));
  }

  async get(id: string): Promise<CampaignRecord> {
    const raw = this.records.get(id);
    if (raw === undefined) throw new RecordNotFoundError(id);
    return CampaignRecord.parse(JSON.parse(raw));
  }

  async put(record: CampaignRecord): Promise<void> {
    const current = await this.get(record.id);
    if (current.revision !== record.revision - 1) {
      throw new RevisionConflictError(record.id, record.revision - 1, current.revision);
    }
    this.records.set(record.id, JSON.stringify(CampaignRecord.parse(record)));
  }

  async list(): Promise<string[]> {
    return [...this.records.keys()].sort();
  }
}

/** One JSON file per campaign, written atomically. No database. */
export class FileCampaignStore implements CampaignStore {
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  private path(id: string): string {
    // Ids are validated against a strict pattern, so they cannot contain path separators.
    return join(this.dir, `${Id.parse(id)}.json`);
  }

  private async write(record: CampaignRecord): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const target = this.path(record.id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(CampaignRecord.parse(record), null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
  }

  async create(record: CampaignRecord): Promise<void> {
    try {
      await this.get(record.id);
    } catch (error) {
      if (error instanceof RecordNotFoundError) return this.write(record);
      throw error;
    }
    throw new Error(`Campaign "${record.id}" already exists.`);
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

  async put(record: CampaignRecord): Promise<void> {
    const current = await this.get(record.id);
    if (current.revision !== record.revision - 1) {
      throw new RevisionConflictError(record.id, record.revision - 1, current.revision);
    }
    await this.write(record);
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
