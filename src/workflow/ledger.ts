import { randomBytes } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import type { LogHead, OperatorLedger } from "./signing.ts";

/**
 * The operator's ledger as a private file beside the operator's key. It must be kept
 * where the agent runtime and the agent-facing server cannot write it.
 */
export class FileOperatorLedger implements OperatorLedger {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  private async read(): Promise<Record<string, LogHead>> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Record<string, LogHead>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async get(campaignId: string): Promise<LogHead | null> {
    return (await this.read())[campaignId] ?? null;
  }

  async set(campaignId: string, head: LogHead): Promise<void> {
    const heads = await this.read();
    const current = heads[campaignId];
    // The ledger only ever moves forward.
    if (current && current.sequence > head.sequence) return;
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
  }
}
