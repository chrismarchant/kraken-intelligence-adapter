import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { Limits } from "../limits.ts";
import { LimitExceededError } from "../limits.ts";
import { withOwnedLock } from "../store/lock.ts";

/**
 * The instance's own account of what has been spent on model calls, kept where the agent
 * runtime cannot write. A campaign record carries a budget too, but the record lives in
 * the campaign store, and whoever can write the store could reset it or start a fresh
 * campaign for a fresh allowance. Spending is therefore also checked here: per campaign,
 * and for the whole instance.
 *
 * A step is charged at its worst case when it starts and corrected to what it used when it
 * ends. A step that never ends stays charged at its worst case.
 */
export interface SpendLedger {
  /** Count a campaign against the instance's limit. Counting one twice changes nothing. */
  registerCampaign(campaignId: string, limits: Limits): Promise<void>;
  /** Charge a step's calls and worst-case tokens, or refuse if a campaign or instance limit would be passed. */
  reserve(campaignId: string, calls: number, tokens: number, limits: Limits): Promise<void>;
  /** Replace what a step reserved with what it used. */
  settle(campaignId: string, reserved: { calls: number; tokens: number }, used: { calls: number; tokens: number }): Promise<void>;
  /** What has been charged so far. */
  totals(): Promise<{ campaigns: number; calls: number; tokens: number }>;
}

interface SpendState {
  campaigns: Record<string, { calls: number; tokens: number }>;
  calls: number;
  tokens: number;
}

const emptyState = (): SpendState => ({ campaigns: Object.create(null) as SpendState["campaigns"], calls: 0, tokens: 0 });
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/** Read a stored state defensively: only own, well-formed entries are kept. */
function parseState(text: string): SpendState {
  const raw = JSON.parse(text) as Partial<SpendState> | null;
  const state = emptyState();
  if (raw === null || typeof raw !== "object") return state;
  if (raw.campaigns && typeof raw.campaigns === "object") {
    for (const [id, entry] of Object.entries(raw.campaigns)) state.campaigns[id] = { calls: count(entry?.calls), tokens: count(entry?.tokens) };
  }
  state.calls = count(raw.calls);
  state.tokens = count(raw.tokens);
  return state;
}

function register(state: SpendState, campaignId: string, limits: Limits): { calls: number; tokens: number } {
  const existing = Object.hasOwn(state.campaigns, campaignId) ? state.campaigns[campaignId] : undefined;
  if (existing) return existing;
  const known = Object.keys(state.campaigns).length;
  if (known >= limits.maxCampaigns) {
    throw new LimitExceededError("maxCampaigns", `This instance already holds ${known} campaigns; the limit is ${limits.maxCampaigns}.`);
  }
  const created = { calls: 0, tokens: 0 };
  state.campaigns[campaignId] = created;
  return created;
}

function reserveIn(state: SpendState, campaignId: string, calls: number, tokens: number, limits: Limits): void {
  const campaign = register(state, campaignId, limits);
  if (campaign.calls + calls > limits.maxModelCalls) {
    throw new LimitExceededError("maxModelCalls", `The instance's own account shows ${campaign.calls} of ${limits.maxModelCalls} model calls used by this campaign; this step needs ${calls}.`);
  }
  if (campaign.tokens + tokens > limits.maxCompletionTokens) {
    throw new LimitExceededError(
      "maxCompletionTokens",
      `The instance's own account shows ${campaign.tokens} completion tokens used or held by this campaign; this step may use up to ${tokens}; the limit is ${limits.maxCompletionTokens}.`,
    );
  }
  if (state.calls + calls > limits.maxInstanceModelCalls) {
    throw new LimitExceededError("maxInstanceModelCalls", `This instance has made ${state.calls} of its ${limits.maxInstanceModelCalls} model calls; this step needs ${calls}.`);
  }
  if (state.tokens + tokens > limits.maxInstanceCompletionTokens) {
    throw new LimitExceededError(
      "maxInstanceCompletionTokens",
      `This instance has used or holds ${state.tokens} completion tokens; this step may use up to ${tokens}; the limit is ${limits.maxInstanceCompletionTokens}.`,
    );
  }
  campaign.calls += calls;
  campaign.tokens += tokens;
  state.calls += calls;
  state.tokens += tokens;
}

function settleIn(state: SpendState, campaignId: string, reserved: { calls: number; tokens: number }, used: { calls: number; tokens: number }): void {
  const campaign = Object.hasOwn(state.campaigns, campaignId) ? state.campaigns[campaignId] : undefined;
  // The correction: negative gives back what was not used, never more than was reserved;
  // positive charges the excess when more was used than reserved. Nothing goes below zero.
  const sane = (value: number) => (Number.isFinite(value) && value >= 0 ? value : 0);
  const calls = sane(used.calls) - reserved.calls >= 0 ? sane(used.calls) - reserved.calls : -Math.min(reserved.calls, reserved.calls - sane(used.calls));
  const tokens = sane(used.tokens) - reserved.tokens >= 0 ? sane(used.tokens) - reserved.tokens : -Math.min(reserved.tokens, reserved.tokens - sane(used.tokens));
  if (campaign) {
    campaign.calls = Math.max(0, campaign.calls + calls);
    campaign.tokens = Math.max(0, campaign.tokens + tokens);
  }
  state.calls = Math.max(0, state.calls + calls);
  state.tokens = Math.max(0, state.tokens + tokens);
}

const totalsOf = (state: SpendState) => ({ campaigns: Object.keys(state.campaigns).length, calls: state.calls, tokens: state.tokens });

/** For tests and for a process that makes no model calls. Lives as long as the process. */
export class MemorySpendLedger implements SpendLedger {
  private readonly state = emptyState();

  async registerCampaign(campaignId: string, limits: Limits): Promise<void> {
    register(this.state, campaignId, limits);
  }

  async reserve(campaignId: string, calls: number, tokens: number, limits: Limits): Promise<void> {
    reserveIn(this.state, campaignId, calls, tokens, limits);
  }

  async settle(campaignId: string, reserved: { calls: number; tokens: number }, used: { calls: number; tokens: number }): Promise<void> {
    settleIn(this.state, campaignId, reserved, used);
  }

  async totals() {
    return totalsOf(this.state);
  }
}

/**
 * The account as a private file. It must sit where the agent runtime cannot write: by
 * default in the operator directory, which already has that requirement. Every change is
 * read, made and written under a lock file, and written by rename, so that two server
 * processes of one instance share one account.
 */
export class FileSpendLedger implements SpendLedger {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  private async read(): Promise<SpendState> {
    try {
      return parseState(await readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
      throw error;
    }
  }

  private async change(apply: (state: SpendState) => void): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await withOwnedLock(`${this.path}.lock`, "The instance's spend account", async () => {
      const state = await this.read();
      apply(state); // a refusal throws here, before anything is written
      const temporary = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`);
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
    });
  }

  registerCampaign(campaignId: string, limits: Limits): Promise<void> {
    return this.change((state) => void register(state, campaignId, limits));
  }

  reserve(campaignId: string, calls: number, tokens: number, limits: Limits): Promise<void> {
    return this.change((state) => reserveIn(state, campaignId, calls, tokens, limits));
  }

  settle(campaignId: string, reserved: { calls: number; tokens: number }, used: { calls: number; tokens: number }): Promise<void> {
    return this.change((state) => settleIn(state, campaignId, reserved, used));
  }

  async totals() {
    return totalsOf(await this.read());
  }
}
