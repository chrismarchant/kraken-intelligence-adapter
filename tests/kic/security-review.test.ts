// Regression tests for the sixth independent review (b8e0170, findings F2-F6) and the
// approval-path security review (177a8c4, findings F3, F5-F8). The approval-resurrection
// finding both reviews made is covered in sixth-review.test.ts; the shim's in tests/shim/spend.test.ts.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { DEFAULT_LIMITS } from "../../src/limits.ts";
import { createOperatorRuntime, createRuntime, loadRuntimeConfig } from "../../src/mcp/runtime.ts";
import { withOwnedLock } from "../../src/store/lock.ts";
import { FileCampaignStore } from "../../src/store/store.ts";
import { canonicalText, displaySafe, fitToWidth } from "../../src/util/runtime.ts";
import { exportProgramme } from "../../src/workflow/assemble.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { FileSpendLedger } from "../../src/workflow/spend.ts";
import { makeService, syntheticBrief } from "./support.ts";

const run = promisify(execFile);
const REPO = resolve(".");
const OPERATOR = resolve("src/cli/operator.ts");
const code = (value: string) => (error: unknown) => error instanceof WorkflowError && error.code === value;
const unwrap = (text: string) => text.replace(/\n  \|     /g, "");

async function operator(args: string[], env: Record<string, string>): Promise<{ code: number; out: string; raw: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [OPERATOR, ...args], { cwd: REPO, env: { PATH: process.env.PATH ?? "", ...env }, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, out: unwrap(stdout + stderr), raw: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, out: unwrap(`${failed.stdout ?? ""}${failed.stderr ?? ""}`), raw: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

async function instance() {
  const base = mkdtempSync(join(tmpdir(), "kic-secrev-"));
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
  const { service } = createRuntime(loadRuntimeConfig(env, REPO));
  return { base, env, keyFile, service, store: new FileCampaignStore(join(env.KIC_DATA_DIR, "campaigns")) };
}

test("stored text cannot reach the first column of the editor's terminal, however it is padded", async () => {
  // The pieces a line is broken into never exceed the width, counting wide characters as two.
  assert.deepEqual(fitToWidth("abcdefghij", 4), ["abcd", "efgh", "ij"]);
  assert.deepEqual(fitToWidth("", 10), [""]);
  assert.ok(fitToWidth("日本語日本語", 4).every((piece) => [...piece].length <= 2));
  // Padding is written out, and never stored by this program's own generation path.
  assert.equal(displaySafe("a    b"), "a \\u{20}\\u{20}\\u{20}b");
  assert.equal(canonicalText("a    b  \n\n\n\nc\t\td "), "a b\n\nc d ");

  const { env, service, store } = await instance();
  const campaign = await service.createCampaign(syntheticBrief());
  await service.interpretBrief(campaign.id);
  const narratives = await service.generateNarratives(campaign.id, 3);
  // A store writer pads a line to the width of a terminal so that what follows starts a new screen line,
  // and makes that look like the tool's own separator and its own statement of what is being asked.
  const fake = "YOU ARE ASKED TO: REJECT narrative nar-other";
  await store.update(campaign.id, (record) => {
    const target = record.narratives.find((n) => n.id === narratives[0]!.id)!;
    target.angle = `Thanks for reading.${" ".repeat(61)}${"-".repeat(60)}${" ".repeat(20)}${fake}${"x".repeat(70)}${fake}`;
    target.title = `${"T".repeat(79)}${fake}`;
  });
  const request = await service.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: `Best.${" ".repeat(74)}${fake}`, requestedBy: "agent" });
  const shown = await operator(["show", "--request", request.requestId], env);
  assert.equal(shown.code, 0, shown.raw);
  const lines = shown.raw.split("\n");
  // Every line that carries any of the planted text is behind the margin.
  const planted = lines.filter((line) => line.includes("REJECT") || line.includes("Thanks for reading") || /T{20}/.test(line) || /x{20}/.test(line));
  assert.ok(planted.length >= 6);
  for (const line of planted) assert.match(line, /^ {2}\| /, JSON.stringify(line));
  // The tool's own statement appears once, in the first column, and says what the record says.
  assert.deepEqual(lines.filter((line) => line.startsWith("YOU ARE ASKED TO:")), [`YOU ARE ASKED TO: SELECT narrative ${narratives[0]!.id}`]);
  // A row of dashes in the first column is the tool's own; the planted one is not there.
  assert.equal(lines.filter((line) => /^-{60}$/.test(line)).length, 2);
  // No stored line is longer than a terminal line, so the terminal never wraps one.
  for (const line of lines.filter((l) => l.startsWith("  | "))) assert.ok(line.length <= 80, `${line.length}: ${line.slice(0, 40)}`);
  assert.ok(shown.raw.includes("\\u{20}"), "the padding is written out");
});

test("show puts every value the request digest covers in front of the editor", async () => {
  const { env, service } = await instance();
  const campaign = await service.createCampaign(syntheticBrief());
  await service.interpretBrief(campaign.id);
  const narratives = await service.generateNarratives(campaign.id, 3);
  const leaves = (value: unknown): string[] => (value === null || value === undefined ? [] : typeof value !== "object" ? [displaySafe(String(value))] : Object.values(value).flatMap(leaves));

  const selection = await service.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Best.", requestedBy: "agent" });
  const described = await service.describeRequest(campaign.id, selection.requestId);
  const shownNarrative = await operator(["show", "--request", selection.requestId], env);
  const narrative = (await service.getCampaign(campaign.id)).narratives[0]!;
  for (const value of [...narrative.risks, ...narrative.evidenceRequirements, ...narrative.supportingThemes, narrative.audienceFit]) {
    assert.ok(shownNarrative.out.includes(displaySafe(value)), `show names "${value.slice(0, 40)}"`);
  }
  assert.deepEqual(leaves(described.covers).filter((value) => !shownNarrative.out.includes(value)), [], "nothing the digest covers is left out");
  // The brief is part of it, in full.
  assert.ok(shownNarrative.out.includes(displaySafe(syntheticBrief().client.brandContext)));
});

test("one request to revise yields one revision, whatever the status fields are reset to", async () => {
  const { service, store, gateway, evaluated, decide } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "request-revision", "Shorter, please.");
  const revision = await service.reviseDraft(id, draft.id);
  assert.equal(revision.revisionOf, draft.id);
  // A store writer puts the original back as it was and asks again on the same signed instruction.
  await store.update(id, (record) => {
    record.drafts.find((d) => d.id === draft.id)!.status = "candidate";
  });
  const before = gateway.calls.length;
  await assert.rejects(service.reviseDraft(id, draft.id), code("draft-not-revisable"));
  assert.equal(gateway.calls.length, before, "no model call is made");
  assert.equal((await service.getCampaign(id)).drafts.filter((d) => d.revisionOf === draft.id).length, 1);
});

test("the keys, the ledger and the releases may not be kept where the agent can write", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-places-"));
  const good = { KIC_DATA_DIR: join(base, "data"), KIC_OPERATOR_DIR: join(base, "operator"), KIC_DECISION_PUBLIC_KEY_FILE: join(base, "keys", "operator.pub") };
  assert.equal(loadRuntimeConfig(good, REPO).decisionPublicKeyFile, join(base, "keys", "operator.pub"));
  // The public key decides whose signatures the server accepts.
  assert.throws(() => loadRuntimeConfig({ ...good, KIC_DECISION_PUBLIC_KEY_FILE: join(base, "data", "operator.pub") }, REPO), /KIC_DECISION_PUBLIC_KEY_FILE must be outside/);
  assert.throws(() => loadRuntimeConfig({ ...good, KIC_DECISION_PUBLIC_KEY_FILE: "operator.pub" }, REPO), /KIC_DECISION_PUBLIC_KEY_FILE must be outside/);
  // The data directory may not sit inside the operator's.
  assert.throws(() => loadRuntimeConfig({ ...good, KIC_DATA_DIR: join(base, "operator", "data") }, REPO), /KIC_DATA_DIR must not be inside/);

  // The operator's tool refuses a private key kept in the data directory or in the channel, and a release directory there.
  const { env, keyFile, service } = await instance();
  const config = loadRuntimeConfig(env, REPO);
  assert.throws(() => createOperatorRuntime(join(config.dataDir, "operator-key.pem"), config), /must not be kept in the data directory/);
  assert.throws(() => createOperatorRuntime(join(config.operatorDir, "operator-key.pem"), config), /must not be kept in the data directory/);
  assert.ok(createOperatorRuntime(keyFile, config).service);
  const campaign = await service.createCampaign(syntheticBrief());
  const refused = await operator(["release", "--campaign", campaign.id, "--digest", "0".repeat(64), "--id", "e", "--name", "E", "--reason", "r"], { ...env, KIC_RELEASE_DIR: join(env.KIC_DATA_DIR, "releases") });
  assert.notEqual(refused.code, 0);
  assert.match(refused.out, /KIC_RELEASE_DIR must not be in the data directory/);
});

test("an export is never written, and nothing is created, through a link planted in the export directory", async () => {
  const { service, evaluated, decide, assemble } = makeService();
  const id = await evaluated();
  const draft = (await service.getCampaign(id)).drafts.find((d) => d.slot === 1)!;
  await decide(id, { kind: "draft", id: draft.id }, "approve");
  const pkg = assemble(await service.getCampaign(id), true);
  const root = mkdtempSync(join(tmpdir(), "kic-export-"));
  const elsewhere = mkdtempSync(join(tmpdir(), "kic-elsewhere-"));
  symlinkSync(elsewhere, join(root, pkg.programmeId));
  await assert.rejects(exportProgramme(pkg, root), code("invalid-export-path"));
  assert.deepEqual(readdirSync(elsewhere), [], "nothing was created on the far side of the link");
  // A file where a directory is expected is refused too.
  const second = mkdtempSync(join(tmpdir(), "kic-export-"));
  writeFileSync(join(second, pkg.programmeId), "not a directory");
  await assert.rejects(exportProgramme(pkg, second), code("invalid-export-path"));
  // An honest export still works.
  const third = mkdtempSync(join(tmpdir(), "kic-export-"));
  assert.ok(existsSync((await exportProgramme(pkg, third)).packagePath));
});

test("a lock on the spend account or the ledger is taken over only when its owner is gone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-lock-"));
  const lock = join(dir, "state.lock");
  // Held by a live process that is not this one (process 1, with its real start time): never broken, however old.
  const started = (() => {
    const stat = readFileSync("/proc/1/stat", "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  })();
  writeFileSync(lock, `1 someinstance ${started} token\n`);
  utimesSync(lock, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));
  await assert.rejects(withOwnedLock(lock, "The test state", async () => "ran", { timeoutMs: 150 }), /locked by another process/);
  assert.ok(existsSync(lock), "the live owner's lock is still there");

  // Left by a process that no longer exists: cleared, and the task runs.
  writeFileSync(lock, "2147483646 gone - token\n");
  assert.equal(await withOwnedLock(lock, "The test state", async () => "ran", { timeoutMs: 500 }), "ran");
  assert.equal(existsSync(lock), false, "released afterwards");

  // A holder whose lock was displaced does not remove the lock that replaced it.
  await withOwnedLock(lock, "The test state", async () => {
    writeFileSync(lock, `1 other ${started} theirs\n`);
  });
  assert.ok(existsSync(lock), "someone else's lock is left alone");
  unlinkSync(lock);

  // Many updates at once through the real account lose nothing.
  const account = new FileSpendLedger(join(dir, "spend.state"));
  const limits = { ...DEFAULT_LIMITS, maxInstanceModelCalls: 1000, maxModelCalls: 1000 };
  await Promise.all(Array.from({ length: 40 }, () => account.reserve("camp-a", 1, 10, limits)));
  assert.deepEqual(await account.totals(), { campaigns: 1, calls: 40, tokens: 400 });
  // A provider that reports more than was reserved is charged for it.
  await account.settle("camp-a", { calls: 1, tokens: 10 }, { calls: 1, tokens: 250 });
  assert.equal((await account.totals()).tokens, 640);
});
