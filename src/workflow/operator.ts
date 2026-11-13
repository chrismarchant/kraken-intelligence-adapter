import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Id } from "../contracts/index.ts";

/**
 * Tells the editor that a decision is waiting, and carries its one-time code. It carries
 * nothing else: what is to be decided is read from the campaign record by the operator's
 * tool, because this channel can be written by the requester's side.
 */
export interface DecisionNotice {
  requestId: string;
  campaignId: string;
  /** The one-time code. It goes to the operator and nowhere else. */
  code: string;
  expiresAt: string;
}

/**
 * Out-of-band path to a human operator. The agent-facing API never returns the code, so an
 * agent cannot confirm a decision it requested. The control holds only if the channel is
 * somewhere the agent runtime cannot read; that is a deployment requirement.
 */
export interface OperatorChannel {
  deliver(notice: DecisionNotice): Promise<void>;
}

export class MemoryOperatorChannel implements OperatorChannel {
  readonly notices: DecisionNotice[] = [];

  async deliver(notice: DecisionNotice): Promise<void> {
    this.notices.push(notice);
  }

  /** The code for a request, as the operator would read it. For tests and the scripted demo. */
  codeFor(requestId: string): string {
    const notice = this.notices.find((n) => n.requestId === requestId);
    if (!notice) throw new Error(`No notice was delivered for request ${requestId}.`);
    return notice.code;
  }
}

/** Writes one file per pending decision into a directory only the operator should read. */
export class FileOperatorChannel implements OperatorChannel {
  private readonly dir: string;
  /** Files in the channel that could not be read as notices on the last call to `pending`. */
  readonly skipped: string[] = [];

  constructor(dir: string) {
    this.dir = dir;
  }

  async deliver(notice: DecisionNotice): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(join(this.dir, `${notice.requestId}.json`), `${JSON.stringify(notice, null, 2)}\n`, { mode: 0o600 });
  }

  async pending(): Promise<DecisionNotice[]> {
    this.skipped.length = 0;
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const notices: DecisionNotice[] = [];
    for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
      // One unreadable or malformed file must not stop the editor from seeing the rest.
      try {
        const parsed = JSON.parse(await readFile(join(this.dir, name), "utf8")) as Partial<DecisionNotice>;
        // The file's content is not trusted: ids must be well-formed, and a notice must sit in
        // the file named for its own request, so that nothing in it can point elsewhere.
        const wellFormed =
          Id.safeParse(parsed.requestId).success &&
          Id.safeParse(parsed.campaignId).success &&
          typeof parsed.code === "string" &&
          typeof parsed.expiresAt === "string" &&
          name === `${parsed.requestId}.json`;
        if (wellFormed && typeof parsed.requestId === "string" && typeof parsed.campaignId === "string" && typeof parsed.code === "string" && typeof parsed.expiresAt === "string") {
          notices.push({ requestId: parsed.requestId, campaignId: parsed.campaignId, code: parsed.code, expiresAt: parsed.expiresAt });
        } else {
          this.skipped.push(name);
        }
      } catch {
        this.skipped.push(name);
      }
    }
    return notices;
  }

  /** Remove the notice for a request. Only a well-formed id is accepted, and only a file inside the channel is removed. */
  async clear(requestId: string): Promise<void> {
    if (!Id.safeParse(requestId).success) return;
    const root = resolve(this.dir);
    const target = resolve(root, `${requestId}.json`);
    if (!target.startsWith(root + sep)) return;
    await unlink(target).catch(() => undefined);
  }
}
