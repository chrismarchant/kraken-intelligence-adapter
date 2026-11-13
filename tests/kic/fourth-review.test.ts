// Regression tests for the findings of the fourth independent review (commit 187f029).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { z } from "zod";
import type { PostDraft, ProgrammeSlot } from "../../src/contracts/index.ts";
import { PostDraft as PostDraftSchema } from "../../src/contracts/index.ts";
import { analyseDraft } from "../../src/evaluation/signals.ts";
import { MistralGateway } from "../../src/gateway/mistral.ts";
import { DEFAULT_LIMITS, LimitExceededError } from "../../src/limits.ts";
import { createRuntime, loadRuntimeConfig } from "../../src/mcp/runtime.ts";
import { FileCampaignStore } from "../../src/store/store.ts";
import { canonicalText, displaySafe } from "../../src/util/runtime.ts";
import { FileOperatorLedger } from "../../src/workflow/ledger.ts";
import { WorkflowError, draftContentHash } from "../../src/workflow/service.ts";
import { FileSpendLedger, MemorySpendLedger } from "../../src/workflow/spend.ts";
import { EDITOR, cleanDraft, expectedFor, makeService, syntheticBrief } from "./support.ts";

const run = promisify(execFile);
const REPO = resolve(".");
const OPERATOR = resolve("src/cli/operator.ts");
const limit = (name: string) => (error: unknown) => error instanceof LimitExceededError && error.limit === name;
const code = (value: string) => (error: unknown) => error instanceof WorkflowError && error.code === value;

const ESC = "\u001b";
const RLO = "\u202e";
const ZWJ = "\u200d";
const VS16 = "\ufe0f";

/** The tool breaks long stored lines and continues them behind "  |     "; this joins them again for matching. */
const unwrap = (text: string) => text.replace(/\n  \|     /g, "");

async function operator(args: string[], env: Record<string, string>): Promise<{ code: number; out: string; raw: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [OPERATOR, ...args], { cwd: REPO, env: { PATH: process.env.PATH ?? "", ...env } });
    return { code: 0, out: unwrap(stdout + stderr), raw: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, out: unwrap(`${failed.stdout ?? ""}${failed.stderr ?? ""}`), raw: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

const slot: ProgrammeSlot = {
  slot: 1,
  week: 1,
  orderInWeek: 1,
  theme: "The weekly report",
  intent: "problem-framing",
  sequencingRationale: "Opens the programme.",
  callToAction: "What did you last check by hand before sending a report?",
  evidenceRequirements: [],
};
const generation = {
  provider: "scripted",
  model: "scripted-model",
  skill: "linkedin-draft",
  skillVersion: "0.1.0",
  promptVersion: "test",
  source: "fixture" as const,
  generatedAt: "2026-01-05T09:00:00.000Z",
  usage: { promptTokens: 1, completionTokens: 1, reasoningTokens: 0 },
};
const draft = (extra = "", overrides: Partial<PostDraft> = {}): PostDraft => ({
  id: "draft-x",
  slot: 1,
  narrativeId: "nar-001",
  status: "candidate",
  revisionOf: null,
  revisionPass: 0,
  generation,
  ...cleanDraft("x", extra),
  ...overrides,
});
const rules = (d: PostDraft) => [...new Set(analyseDraft(syntheticBrief(), slot, d, DEFAULT_LIMITS).failures.map((f) => f.rule))];

// --- F1: what the editor sees on a terminal ----------------------------------------------

test("text printed for the editor cannot carry a control, invisible or direction character", () => {
  const hostile = `Plain${ESC}[4A${ESC}[2Kcover text\rover${RLO}desrever\u200b\u0007\u009b2K\u2028end`;
  const shown = displaySafe(hostile);
  assert.doesNotMatch(shown, /[\u0000-\u001f\u007f-\u009f\u2028\u2029]|[\p{Cf}]/u, "nothing that a terminal acts on is left");
  for (const visible of ["\\u{1b}", "\\u{d}", "\\u{202e}", "\\u{200b}", "\\u{7}", "\\u{9b}", "\\u{2028}"]) assert.ok(shown.includes(visible), `${visible} is written out`);
  // Several lines are allowed only where asked for, and nothing else gets through with them.
  assert.equal(displaySafe("one\ntwo"), "one\\u{a}two");
  assert.equal(displaySafe(`one\ntwo${ESC}`, { multiline: true }), "one\ntwo\\u{1b}");
  // An emoji keeps the joiners and selectors that are part of it.
  for (const emoji of ["\u{1F469}\u200d\u{1F4BB}", "\u2764\ufe0f", "1\ufe0f\u20e3", "\u{1F44D}\u{1F3FD}"]) assert.equal(displaySafe(emoji), emoji);
});

test("stored text with control characters is not a valid record, and model output is stripped of them", async () => {
  assert.equal(PostDraftSchema.safeParse(draft()).success, true);
  for (const field of ["hook", "body", "callToAction", "variant", "approach"] as const) {
    assert.equal(PostDraftSchema.safeParse(draft("", { [field]: `Fine${ESC}[2K text` })).success, false, `${field} with an escape character is refused`);
    assert.equal(PostDraftSchema.safeParse(draft("", { [field]: "Fine\rtext" })).success, false, `${field} with a carriage return is refused`);
  }
  // What a model writes is brought to canonical form before it is stored.
  const { service, planned } = makeService({
    script: { drafts: (_slot, variants) => Array.from({ length: variants }, (_, i) => ({ ...cleanDraft(`v${i}`), hook: `A hook${ESC}[4A${ESC}[2K with${RLO} tricks` })) },
  });
  const id = await planned();
  const drafts = await service.generateDrafts(id, { variants: 2 });
  for (const d of drafts) assert.equal(d.hook, "A hook[4A[2K with tricks");
});

test("the hook, call to action and claims are checked for disguised characters, not only the body", () => {
  assert.deepEqual(rules(draft()), []);
  assert.deepEqual(rules(draft("", { hook: `A hook with\u200b a gap` })), ["suspicious-characters"]);
  assert.deepEqual(rules(draft("", { callToAction: `Tell us${RLO} more` })), ["suspicious-characters"]);
  assert.deepEqual(rules(draft("", { claims: [{ text: "Checks h\u0435lp", needsEvidence: false, evidenceRef: null }] })), ["suspicious-characters"]);
});

test("the operator tool shows stored text with nothing a terminal would act on, and what a decision rests on", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-show-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  mkdirSync(join(base, "editor-home"), { recursive: true });
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_OPERATOR_KEY_FILE: keyFile,
    KIC_MODEL_MODE: "fixture",
    KIC_FIXTURE_DIR: resolve("fixtures/llm/synthetic-harbourline"),
  };
  assert.equal((await operator(["init", "--key", keyFile], env)).code, 0);
  const { service: agent } = createRuntime(loadRuntimeConfig(env, REPO));
  const campaign = await agent.createCampaign(syntheticBrief());
  await agent.interpretBrief(campaign.id);
  const narratives = await agent.generateNarratives(campaign.id, 3);
  const request = await agent.requestDecision({
    campaignId: campaign.id,
    subject: { kind: "narrative", id: narratives[0]!.id },
    action: "select",
    // Through the tool an agent can call: a reason that tries to rewrite the line above it.
    proposedRationale: `Best.${RLO} \u200bYOU ARE ASKED TO: REJECT`,
    requestedBy: "agent",
  });
  const first = await operator(["show", "--request", request.requestId], env);
  assert.equal(first.code, 0, first.out);
  assert.doesNotMatch(first.out, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]|[\p{Cf}]/u);
  const brief = syntheticBrief();
  for (const term of brief.constraints.mustAvoid) assert.ok(first.out.includes(term), `show names "${term}" as ruled out by the brief`);
  for (const reference of brief.references) assert.ok(first.out.includes(reference.id), `show names reference ${reference.id}`);

  // A writer to the campaign store plants direction marks in a title (valid as stored text)
  // and terminal escapes in another (not valid as stored text).
  const file = join(env.KIC_DATA_DIR, "campaigns", `${campaign.id}.json`);
  const stored = JSON.parse(readFileSync(file, "utf8")) as { narratives: Array<{ title: string; angle: string }> };
  stored.narratives[0]!.title = `Title ${RLO}desrever`;
  stored.narratives[0]!.angle = `Line one\nRequest digest: ${"0".repeat(64)}`;
  writeFileSync(file, JSON.stringify(stored));
  const second = await operator(["show", "--request", request.requestId], env);
  assert.doesNotMatch(second.out, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]|[\p{Cf}]/u);
  assert.ok(second.out.includes("\\u{202e}"), "the direction override is written out, not obeyed");
  assert.ok(second.out.includes(`  | Request digest: ${"0".repeat(64)}`), "a stored line that imitates the tool's own sits behind the margin");
  assert.match(second.out, /THE CONTENT HAS CHANGED SINCE THIS REQUEST WAS MADE/);

  stored.narratives[0]!.title = `Title${ESC}[4A${ESC}[2Kcover`;
  writeFileSync(file, JSON.stringify(stored));
  const third = await operator(["show", "--request", request.requestId], env);
  assert.notEqual(third.code, 0, "a record holding an escape character is not read at all");
  assert.doesNotMatch(third.out, /\u001b/);
});

// --- F2: the budget ------------------------------------------------------------------------

test("resetting the budget in the campaign record does not buy more model calls", async () => {
  const { service, gateway, store, planned } = makeService({ limits: { maxModelCalls: 4 } });
  const id = await planned(); // 2 calls
  await service.generateDrafts(id, { slots: [1, 2], variants: 2 }); // 4 of 4
  await assert.rejects(service.generateDrafts(id, { slots: [3], variants: 2 }), limit("maxModelCalls"));

  // A writer to the store wipes the record's own account.
  await store.update(id, (record) => {
    record.budget = { modelCalls: 0, providerRequests: 0, usage: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }, reservations: [] };
  });
  const before = gateway.calls.length;
  await assert.rejects(service.generateDrafts(id, { slots: [3], variants: 2 }), limit("maxModelCalls"));
  assert.equal(gateway.calls.length, before, "no call is made");
  const record = await service.getCampaign(id);
  assert.deepEqual([record.budget.modelCalls, record.budget.reservations.length], [0, 0], "the refused step leaves nothing reserved in the record");
});

test("new campaigns are not new allowances: the instance has its own ceilings", async () => {
  const calls = makeService({ limits: { maxInstanceModelCalls: 5 } });
  let made = 0;
  await assert.rejects(async () => {
    for (let i = 0; i < 10; i += 1) {
      const campaign = await calls.service.createCampaign(syntheticBrief());
      await calls.service.generateNarratives(campaign.id, 2);
      made += 1;
    }
  }, limit("maxInstanceModelCalls"));
  assert.equal(made, 5);
  assert.equal(calls.gateway.calls.length, 5);

  // Tokens: every step holds its worst case (30,000 for narratives) until it settles at 400.
  const tokens = makeService({ limits: { maxInstanceCompletionTokens: 30_300 } });
  const one = await tokens.service.createCampaign(syntheticBrief());
  await tokens.service.generateNarratives(one.id, 2);
  const two = await tokens.service.createCampaign(syntheticBrief());
  await assert.rejects(tokens.service.generateNarratives(two.id, 2), limit("maxInstanceCompletionTokens"));

  const campaigns = makeService({ limits: { maxCampaigns: 2 } });
  await campaigns.service.createCampaign(syntheticBrief());
  await campaigns.service.createCampaign(syntheticBrief());
  await assert.rejects(campaigns.service.createCampaign(syntheticBrief()), limit("maxCampaigns"));
  assert.equal((await campaigns.service.listCampaigns()).length, 2);
});

test("the instance's spend account is a file outside the store, shared by processes, and corrected to what was used", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-spend-"));
  const path = join(dir, "server-spend.state");
  const limits = { ...DEFAULT_LIMITS, maxCampaigns: 3, maxInstanceModelCalls: 10, maxInstanceCompletionTokens: 100_000 };
  const first = new FileSpendLedger(path);
  const second = new FileSpendLedger(path); // a second server process of the same instance
  await first.reserve("camp-a", 2, 60_000, limits);
  await assert.rejects(second.reserve("camp-b", 1, 50_000, limits), limit("maxInstanceCompletionTokens"));
  assert.deepEqual(await second.totals(), { campaigns: 1, calls: 2, tokens: 60_000 }, "a refusal writes nothing, not even the campaign");
  await first.settle("camp-a", { calls: 2, tokens: 60_000 }, { calls: 2, tokens: 900 });
  assert.deepEqual(await second.totals(), { campaigns: 1, calls: 2, tokens: 900 });
  await second.reserve("camp-b", 1, 50_000, limits);
  // A step that never settles stays charged at its worst case.
  assert.deepEqual(await first.totals(), { campaigns: 2, calls: 3, tokens: 50_900 });
  // Settling can only give back what was reserved.
  await first.settle("camp-b", { calls: 1, tokens: 50_000 }, { calls: 0, tokens: -5_000_000 });
  assert.deepEqual(await first.totals(), { campaigns: 2, calls: 2, tokens: 900 });
  // Ids that are also property names of every object are ordinary campaigns.
  await first.registerCampaign("constructor", limits);
  await assert.rejects(first.registerCampaign("camp-d", limits), limit("maxCampaigns"));
  await first.reserve("constructor", 1, 10, limits);
  assert.deepEqual(await first.totals(), { campaigns: 3, calls: 3, tokens: 910 });

  const memory = new MemorySpendLedger();
  await memory.reserve("toString", 1, 10, limits);
  assert.deepEqual(await memory.totals(), { campaigns: 1, calls: 1, tokens: 10 });

  // The server runtime keeps the account outside the data directory and refuses one inside it.
  const base = mkdtempSync(join(tmpdir(), "kic-spend-config-"));
  const env = { KIC_DATA_DIR: join(base, "data"), KIC_OPERATOR_DIR: join(base, "operator"), KIC_ALLOW_UNSIGNED_DECISIONS: "1" };
  assert.equal(loadRuntimeConfig(env, REPO).spendFile, join(base, "operator", "server-spend.state"));
  assert.throws(() => loadRuntimeConfig({ ...env, KIC_SPEND_FILE: join(base, "data", "spend.state") }, REPO), /outside the data directory/);
  assert.throws(() => loadRuntimeConfig({ ...env, KIC_MAX_INSTANCE_MODEL_CALLS: "lots" }, REPO), /positive whole number/);
  assert.equal(loadRuntimeConfig({ ...env, KIC_MAX_INSTANCE_MODEL_CALLS: "7" }, REPO).limits.maxInstanceModelCalls, 7);
});

test("the operator's ledger treats a campaign id that is also an object property name as an ordinary id", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-ledger-"));
  const ledger = new FileOperatorLedger(join(dir, "ledger.json"));
  await ledger.create();
  assert.equal(await ledger.get("constructor"), null);
  await ledger.set("constructor", { sequence: 1, sha256: "a".repeat(64) });
  assert.deepEqual(await ledger.get("constructor"), { sequence: 1, sha256: "a".repeat(64) });
});

// --- F3: what a decision rests on ------------------------------------------------------------

test("an approval is void once the brief, the planned post, the claims or the post it is for are changed", async () => {
  const approved = async () => {
    const made = makeService();
    const id = await made.evaluated();
    const target = (await made.service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
    await made.decide(id, { kind: "draft", id: target.id }, "approve");
    assert.equal(made.assemble(await made.service.getCampaign(id), true).posts[0]!.state, "approved");
    return { ...made, id, draftId: target.id };
  };

  const assembled = (made: { assemble: typeof brief.assemble; service: typeof brief.service; id: string }) => async () => made.assemble(await made.service.getCampaign(made.id), true);

  // The brief: a ruled-out term is dropped after the editor decided. Every decision was made on the old brief.
  const brief = await approved();
  await brief.store.update(brief.id, (record) => {
    record.brief.constraints.mustAvoid = record.brief.constraints.mustAvoid.slice(1);
  });
  await assert.rejects(assembled(brief), code("narrative-not-approved"));

  // The planned post the draft was approved for.
  const plan = await approved();
  await plan.store.update(plan.id, (record) => {
    record.plan!.slots[0]!.theme = "A theme nobody reviewed";
  });
  await assert.rejects(assembled(plan), code("nothing-approved"));

  // The claims a draft records and what they cite.
  const claims = await approved();
  await claims.store.update(claims.id, (record) => {
    record.drafts.find((d) => d.id === claims.draftId)!.claims = [{ text: "Invented", needsEvidence: false, evidenceRef: null }];
  });
  await assert.rejects(assembled(claims), code("nothing-approved"));

  // The post a draft is for: approved as post 1, moved to post 4.
  const moved = await approved();
  await moved.store.update(moved.id, (record) => {
    record.drafts.find((d) => d.id === moved.draftId)!.slot = 4;
  });
  await assert.rejects(assembled(moved), code("nothing-approved"));
});

test("the editor is shown the brief's constraints, the planned post and the claims, and a brief changed after reading is not signed", async () => {
  const { service, store, operator: channel, evaluated } = makeService();
  const id = await evaluated();
  const target = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  const request = await service.requestDecision({ campaignId: id, subject: { kind: "draft", id: target.id }, action: "approve", proposedRationale: "Top.", requestedBy: "agent" });
  const shown = await service.describeRequest(id, request.requestId);
  const basis = shown.content.basis.map((b) => `${b.label}\n${b.lines.join("\n")}`).join("\n");
  const brief = syntheticBrief();
  for (const term of brief.constraints.mustAvoid) assert.ok(basis.includes(term));
  for (const reference of brief.references) assert.ok(basis.includes(reference.id) && basis.includes(reference.summary));
  assert.match(basis, /Planned post 1/);
  assert.match(basis, /Claims the draft records/);
  assert.match(shown.content.evaluation ?? "", /not signed/);

  // After the editor read it, a ruled-out term is dropped from the brief and the request rewritten to match.
  const read = await expectedFor(service, id, request.requestId);
  await store.update(id, (record) => {
    record.brief.constraints.mustAvoid = [];
    // The attacker also rewrites the request so that it matches the changed brief.
    record.decisionRequests.find((r) => r.id === request.requestId)!.subjectContentSha256 = draftContentHash(record, record.drafts.find((d) => d.id === target.id)!);
  });
  await assert.rejects(
    service.confirmDecision({ campaignId: id, requestId: request.requestId, code: channel.codeFor(request.requestId), actor: EDITOR, rationale: "Approve.", expected: read }),
    code("request-mismatch"),
  );
  assert.equal((await service.getCampaign(id)).decisions.filter((d) => d.subject.id === target.id).length, 0);
});

// --- F4: a stream that does not say what it cost ----------------------------------------------

test("a streamed answer that reports no usage is charged at its whole allowance", async () => {
  const body = [
    `data: ${JSON.stringify({ model: "m", choices: [{ delta: { content: '{"ok":true}' }, finish_reason: "stop" }] })}`,
    "data: [DONE]",
    "",
  ].join("\n\n");
  const fetchImpl = (async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  const gateway = new MistralGateway({ fetch: fetchImpl, apiKey: "placeholder", backoffMs: 1 });
  const result = await gateway.generateJson({ purpose: "p", system: "s", user: "u", schema: z.object({ ok: z.boolean() }), schemaName: "x", maxTokens: 12_000 });
  assert.equal(result.value.ok, true);
  assert.equal(result.usage.completionTokens, 12_000);
});

// --- F5: invisible characters beside an emoji ---------------------------------------------------

test("an invisible character is kept only where it is part of an emoji", () => {
  // Real emoji sequences are untouched.
  for (const emoji of ["\u{1F469}\u200d\u{1F4BB}", "\u2764\ufe0f", "1\ufe0f\u20e3", "\u{1F44D}\u{1F3FD}", "\u{1F468}\u200d\u{1F469}\u200d\u{1F467}", "\u{1F3F3}\ufe0f\u200d\u{1F308}"]) {
    assert.equal(canonicalText(`Good ${emoji} work`), `Good ${emoji} work`);
    // A keycap holds a digit, which the figure rule reads as a number; that rule is not under test here.
    // Since the fourth scope review a post may use only the emoji on a fixed list, one at a
    // time: no joined emoji, skin tones, keycaps or flags. Canonical form still leaves them be.
    assert.deepEqual(rules(draft(`Good ${emoji} work.`)).filter((rule) => rule === "suspicious-characters"), emoji === "\u2764\ufe0f" ? [] : ["suspicious-characters"]);
  }
  // A run of joiners and selectors after an emoji can carry hidden data; it is not part of the emoji.
  const run = Array.from({ length: 64 }, (_, i) => (i % 3 === 0 ? VS16 : ZWJ)).join("");
  assert.equal(canonicalText(`Fine \u{1F44D}${run} text`), `Fine \u{1F44D}${VS16} text`);
  assert.deepEqual(rules(draft(`Fine \u{1F44D}${run} text.`)), ["suspicious-characters"]);
  // A joiner, a tag character or a direction override leaning on an emoji.
  for (const hidden of [`\u{1F44D}${ZWJ}`, `\u{1F44D}${ZWJ}\u{E0049}`, `\u{1F44D}${ZWJ}${RLO}`, `\u{1F44D}${VS16}${RLO}`, `\u{1F44D}\u{E0049}`, `\u{1F44D}\u200e`]) {
    assert.equal(canonicalText(`Fine ${hidden} text`).replace(VS16, ""), "Fine \u{1F44D} text");
    assert.deepEqual(rules(draft(`Fine ${hidden} text.`)), ["suspicious-characters"], [...hidden].map((c) => c.codePointAt(0)!.toString(16)).join(" "));
  }
  // The bidi case from the review: text stored backwards behind an override, so that it displays as a ruled-out phrase.
  assert.deepEqual(rules(draft(`Good \u{1F44D}${ZWJ}${RLO}ti eetnaraug eW`)), ["suspicious-characters"]);
  // Canonical form is stable.
  for (const text of [`a\u{1F44D}${run}b`, `x${ZWJ}y`, `1${VS16}\u20e3`, "\u{1F469}\u200d\u{1F4BB}"]) assert.equal(canonicalText(canonicalText(text)), canonicalText(text));
});
