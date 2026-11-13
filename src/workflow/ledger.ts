import { randomBytes } from "node:crypto";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import type { LogHead, OperatorLedger } from "./signing.ts";

export class LedgerMissingError extends Error {
  constructor(path: string) {
    super(
      `The operator's ledger is missing (${path}). Without it, decisions removed from the end of a campaign's log cannot be detected. ` +
        "If this is a new operator machine or the ledger was lost, create a new one with `new-ledger --accept-current-state`; otherwise restore it.",
    );
    this.name = "LedgerMissingError";
  }
}

/**
 * The operator's ledger as a private file beside the operator's key. It must be kept
 * where the agent runtime and the agent-facing server cannot write or delete it.
 *
 * A missing ledger is an error, never an empty one: a ledger that silently reappeared
 * empty would turn rollback detection off without anyone noticing.
 */
export class FileOperatorLedger implements OperatorLedger {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  /** Create an empty ledger. Refuses if one exists. */
  async create(): Promise<void> {
    const handle = await open(this.path, "wx", 0o600);
    try {
      await handle.writeFile("{}\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async read(): Promise<Record<string, LogHead>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Record<string, LogHead>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new LedgerMissingError(this.path);
      throw error;
    }
  }

  async get(campaignId: string): Promise<LogHead | null> {
    return (await this.read())[campaignId] ?? null;
  }

  async set(campaignId: string, head: LogHead): Promise<void> {
    // Read, change and write under a lock, so that two operator processes working on
    // different campaigns cannot drop each other's entries.
    const lockPath = `${this.path}.lock`;
    const deadline = Date.now() + 10_000;
    for (;;) {
      try {
        await (await open(lockPath, "wx", 0o600)).close();
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (age > 30_000) await unlink(lockPath).catch(() => undefined);
        else if (Date.now() > deadline) throw new Error("The operator's ledger is locked by another operator process.");
        else await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      const heads = await this.read();
      const current = heads[campaignId];
      // The ledger only ever moves forward.
      if (current && current.sequence >= head.sequence) return;
      heads[campaignId] = head;
      const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(heads, null, 2)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await rename(temporary, this.path);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
    } finally {
      await unlink(lockPath).catch(() => undefined);
    }
  }
}
