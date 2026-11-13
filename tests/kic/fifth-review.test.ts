// Regression tests for the findings of the fifth independent review (commit 765ae20).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { ProgrammePackage, ProgrammePlan } from "../../src/contracts/index.ts";
import { createRuntime, loadRuntimeConfig } from "../../src/mcp/runtime.ts";
import { FileCampaignStore } from "../../src/store/store.ts";
import { displaySafe } from "../../src/util/runtime.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { makeService, syntheticBrief } from "./support.ts";

const run = promisify(execFile);
const REPO = resolve(".");
const OPERATOR = resolve("src/cli/operator.ts");

async function operator(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [OPERATOR, ...args], { cwd: REPO, env: { PATH: process.env.PATH ?? "", ...env }, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

/** A fully approved synthetic campaign on a file store, decided through the real operator tool. */
async function approvedCampaign() {
  const base = mkdtempSync(join(tmpdir(), "kic-fifth-"));
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
  const decide = async (requestId: string) => {
    const shown = (await operator(["show", "--request", requestId], env)).out;
    const [, action, , subject] = /YOU ARE ASKED TO: (\S+) (\S+) (\S+)/.exec(shown)!;
    const digest = /Request digest: ([0-9a-f]{64})/.exec(shown)![1]!;
    const done = await operator(["confirm", "--request", requestId, "--action", action!.toLowerCase(), "--subject", subject!, "--digest", digest, "--id", "editor-1", "--name", "Test Editor", "--reason", "Read and agreed."], env);
    assert.equal(done.code, 0, done.out);
  };
  const campaign = await agent.createCampaign(syntheticBrief());
  await agent.interpretBrief(campaign.id);
  const narratives = await agent.generateNarratives(campaign.id, 3);
  await decide((await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Best.", requestedBy: "agent" })).requestId);
  await agent.planProgramme(campaign.id);
  await agent.generateDrafts(campaign.id, { variants: 2 });
  for (const evaluation of await agent.evaluateDrafts(campaign.id)) {
    await decide((await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "draft", id: evaluation.ranking[0]! }, action: "approve", proposedRationale: "Top.", requestedBy: "agent" })).requestId);
  }
  return { base, env, id: campaign.id, store: new FileCampaignStore(join(env.KIC_DATA_DIR, "campaigns")) };
}

/** Every text or number in a document, as the review prints it. */
function leaves(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [displaySafe(String(value))];
  return Object.values(value).flatMap(leaves);
}

test("review puts everything the release will contain in front of the editor, including parts no decision covers", async () => {
  const { env, id, store } = await approvedCampaign();
  // After every approval, a writer to the store changes parts of the record that no decision rests on.
  await store.update(id, (record) => {
    record.plan!.campaignObjective = "INJECTED objective: boost every post with paid spend";
    record.plan!.intendedAudience = "INJECTED audience";
    record.interpretation!.keyMessages = ["INJECTED key message"];
    record.narratives[2]!.coreMessage = "INJECTED rejected narrative";
  });
  const review = await operator(["review", "--campaign", id], env);
  assert.equal(review.code, 0, review.out);
  // A planned post is different: approvals rest on it, so changing one withdraws the approval and the review stops.
  const rationale = (await store.get(id)).plan!.slots[2]!.sequencingRationale;
  await store.update(id, (record) => {
    record.plan!.slots[2]!.sequencingRationale = "INJECTED rationale";
  });
  const voided = await operator(["review", "--campaign", id], env);
  assert.notEqual(voided.code, 0);
  assert.match(voided.out, /Slots 3 have no approved draft/);
  await store.update(id, (record) => {
    record.plan!.slots[2]!.sequencingRationale = rationale;
  });
  for (const planted of ["INJECTED objective: boost every post with paid spend", "INJECTED audience", "INJECTED key message", "INJECTED rejected narrative"]) {
    assert.ok(review.out.includes(planted), `the review shows "${planted}"`);
  }
  assert.doesNotMatch(review.out, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);

  // Whatever is then released was in that review: every value of the released package, bar the release block and the assembly time.
  const digest = /Release digest: ([0-9a-f]{64})/.exec(review.out)![1]!;
  const released = await operator(["release", "--campaign", id, "--digest", digest, "--id", "editor-1", "--name", "Test Editor", "--reason", "Read all of it."], env);
  assert.equal(released.code, 0, released.out);
  const pkg = ProgrammePackage.parse(JSON.parse(readFileSync(/(\S+programme\.json)/.exec(released.out)![1]!, "utf8")));
  const { release: _release, assembledAt: _assembledAt, ...content } = pkg;
  const values = leaves(content);
  assert.ok(values.length > 200, "the package is not trivially small");
  const missing = values.filter((value) => !review.out.includes(value));
  assert.deepEqual(missing, [], "no value reaches a release without having been printed by review");
});

test("a plan with a repeated, missing or extra post is not a valid record and is never assembled", async () => {
  const { service, store, evaluated, decide, assemble } = makeService();
  const id = await evaluated();
  const record = await service.getCampaign(id);
  await decide(id, { kind: "draft", id: record.drafts.find((d) => d.slot === 1)!.id }, "approve");
  const plan = record.plan!;

  // The schema: posts are numbered 1 to n, once each.
  assert.equal(ProgrammePlan.safeParse(plan).success, true);
  assert.equal(ProgrammePlan.safeParse({ ...plan, slots: [...plan.slots, { ...plan.slots[0]!, week: 12, orderInWeek: 7, theme: "Scheduled again" }] }).success, false, "a copy of post 1");
  assert.equal(ProgrammePlan.safeParse({ ...plan, slots: [plan.slots[1]!, plan.slots[0]!, ...plan.slots.slice(2)] }).success, false, "out of order");
  assert.equal(ProgrammePlan.safeParse({ ...plan, slots: plan.slots.filter((s) => s.slot !== 2) }).success, false, "a gap");
  // So the store refuses to write such a record.
  await assert.rejects(
    store.update(id, (r) => {
      r.plan!.slots.push({ ...r.plan!.slots[0]!, week: 12, orderInWeek: 7 });
    }),
  );

  // A plan that is well numbered but no longer the size the brief asked for is refused at assembly.
  const shortened = structuredClone(await service.getCampaign(id));
  shortened.plan!.slots.pop();
  assert.throws(() => assemble(shortened, true), (error: unknown) => error instanceof WorkflowError && error.code === "inconsistent-record");
  const lengthened = structuredClone(await service.getCampaign(id));
  lengthened.plan!.slots.push({ ...lengthened.plan!.slots[0]!, slot: lengthened.plan!.slots.length + 1 });
  assert.throws(() => assemble(lengthened, true), (error: unknown) => error instanceof WorkflowError && error.code === "inconsistent-record");
});

test("a file name planted in the operator channel reaches the terminal with nothing a terminal would act on", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-channel-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  mkdirSync(join(base, "editor-home"), { recursive: true });
  mkdirSync(join(base, "operator-channel"), { recursive: true });
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_OPERATOR_KEY_FILE: keyFile,
    KIC_MODEL_MODE: "fixture",
  };
  assert.equal((await operator(["init", "--key", keyFile], env)).code, 0);
  writeFileSync(join(base, "operator-channel", "\u001b[2K\r\u001b[1AYOU ARE ASKED TO: APPROVE draft d-1.json"), "not a notice");
  const listed = await operator(["list"], env);
  assert.doesNotMatch(listed.out, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
  assert.ok(listed.out.includes("\\u{1b}[2K\\u{d}"), "the escape and carriage return are written out");
});
