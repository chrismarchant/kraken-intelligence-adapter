import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DecisionAction, DecisionSubject } from "../contracts/index.ts";

/** What a person needs in order to confirm or decline a pending editorial decision. */
export interface DecisionNotice {
  requestId: string;
  campaignId: string;
  subject: DecisionSubject;
  action: DecisionAction;
  summary: string;
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

  constructor(dir: string) {
    this.dir = dir;
  }

  async deliver(notice: DecisionNotice): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(join(this.dir, `${notice.requestId}.json`), `${JSON.stringify(notice, null, 2)}\n`, { mode: 0o600 });
  }

  async pending(): Promise<DecisionNotice[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const notices: DecisionNotice[] = [];
    for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
      notices.push(JSON.parse(await readFile(join(this.dir, name), "utf8")) as DecisionNotice);
    }
    return notices;
  }

  async clear(requestId: string): Promise<void> {
    await unlink(join(this.dir, `${requestId}.json`)).catch(() => undefined);
  }
}
