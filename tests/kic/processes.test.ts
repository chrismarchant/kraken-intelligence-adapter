import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { ProgrammePackage } from "../../src/contracts/index.ts";
import { createRuntime, inside, loadRuntimeConfig } from "../../src/mcp/runtime.ts";
import { releaseIsValid } from "../../src/workflow/assemble.ts";
import { FileCampaignStore } from "../../src/store/store.ts";
import { FileOperatorChannel } from "../../src/workflow/operator.ts";
import { WorkflowError } from "../../src/workflow/service.ts";
import { verifierFromPublicKeyPem, verifyDecisionLog } from "../../src/workflow/signing.ts";
import { makeService, syntheticBrief, expectedFor } from "./support.ts";

const run = promisify(execFile);
const REPO = resolve(".");
const OPERATOR = resolve("src/cli/operator.ts");

/** Run the operator tool as its own process, as the editor would. */
async function operator(args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [OPERATOR, ...args], { cwd: REPO, env: { PATH: process.env.PATH ?? "", ...env } });
    return { code: 0, out: stdout + stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
}

test("separate processes writing one campaign neither lose an update nor corrupt the file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kic-procs-"));
  const { service } = makeService({ store: new FileCampaignStore(dir) });
  const { id } = await service.createCampaign(syntheticBrief());

  const writers = 4;
  const each = 25;
  const exits = await Promise.all(
    Array.from({ length: writers }, (_, w) =>
      new Promise<number>((done) => {
        const child = spawn(process.execPath, [resolve("tests/kic/helpers/store-writer.ts"), dir, id, `writer-${w}`, String(each)], { cwd: REPO, stdio: "ignore" });
        child.on("exit", (code) => done(code ?? 1));
      }),
    ),
  );
  assert.deepEqual(exits, Array(writers).fill(0), "every writer process finished cleanly");

  const record = await new FileCampaignStore(dir).get(id);
  const raced = record.audit.filter((e) => e.event === "process-race").map((e) => e.detail);
  assert.equal(raced.length, writers * each, "every update from every process was applied");
  assert.equal(new Set(raced).size, writers * each, "and none was applied twice");
  assert.equal(record.revision, writers * each);
  for (let w = 0; w < writers; w++) {
    const own = raced.filter((d) => d.startsWith(`writer-${w}:`)).map((d) => Number(d.split(":")[1]));
    assert.deepEqual(own, Array.from({ length: each }, (_, i) => i), `writer ${w}'s updates are in order`);
  }
  assert.deepEqual(readdirSync(dir).filter((n) => !n.endsWith(".json")), [], "no lock or temporary file is left behind");
});

test("the operator tool creates a key, shows the content, signs a confirmation and closes a declined request", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-operator-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_MODEL_MODE: "fixture",
    KIC_FIXTURE_DIR: resolve("fixtures/llm/synthetic-harbourline"),
  };
  (await import("node:fs")).mkdirSync(join(base, "editor-home"), { recursive: true });

  // init: creates the pair once, private key readable by its owner only, and never overwrites.
  const created = await operator(["init", "--key", keyFile], env);
  assert.equal(created.code, 0, created.out);
  assert.equal(statSync(keyFile).mode & 0o777, 0o600);
  assert.ok(existsSync(`${keyFile}.pub`));
  assert.equal(readFileSync(`${keyFile}.ledger.json`, "utf8").trim(), "{}", "the ledger is created, empty, with the key");
  const firstKey = readFileSync(keyFile, "utf8");
  assert.notEqual((await operator(["init", "--key", keyFile], env)).code, 0, "an existing key is not overwritten");
  assert.equal(readFileSync(keyFile, "utf8"), firstKey);

  // The agent-facing runtime: public key only.
  const { service: agent } = createRuntime(loadRuntimeConfig(env, REPO));
  const campaign = await agent.createCampaign(syntheticBrief());
  await agent.interpretBrief(campaign.id);
  const narratives = await agent.generateNarratives(campaign.id, 3);
  const select = await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Strongest.", requestedBy: "agent" });

  // The agent's process can read the notice here, and still cannot record the decision.
  const notice = JSON.parse(readFileSync(join(env.KIC_OPERATOR_DIR, `${select.requestId}.json`), "utf8")) as { code: string };
  await assert.rejects(
    agent.confirmDecision({ campaignId: campaign.id, requestId: select.requestId, code: notice.code, actor: { kind: "human", id: "x", name: "X" }, rationale: "self", expected: await expectedFor(agent, campaign.id, select.requestId) }),
    (error: unknown) => error instanceof WorkflowError && error.code === "cannot-record-decisions",
  );

  const withKey = { ...env, KIC_OPERATOR_KEY_FILE: keyFile };
  const title = narratives[0]!.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const listed = await operator(["list"], withKey);
  assert.match(listed.out, new RegExp(`${select.requestId}.*select narrative ${narratives[0]!.id}`));
  const shown = await operator(["show", "--request", select.requestId], withKey);
  assert.match(shown.out, new RegExp(`YOU ARE ASKED TO: SELECT narrative ${narratives[0]!.id}`));
  assert.match(shown.out, new RegExp(title));
  assert.match(shown.out, /Requester's reason \(not verified\)/);
  assert.ok(!shown.out.includes(notice.code), "the tool does not print the code");
  const digest = /Request digest: ([0-9a-f]{64})/.exec(shown.out)![1]!;
  const confirmArgs = (overrides: Record<string, string> = {}) => {
    const args: Record<string, string> = { request: select.requestId, action: "select", subject: narratives[0]!.id, digest, id: "editor-1", name: "Test Editor", reason: "Chosen.", ...overrides };
    return ["confirm", ...Object.entries(args).flatMap(([k, v]) => [`--${k}`, v])];
  };

  // The editor must say what they are confirming, and it must be what the record says.
  assert.notEqual((await operator(["confirm", "--request", select.requestId, "--id", "editor-1", "--name", "E", "--reason", "r"], withKey)).code, 0, "action, subject and hash are required");
  const wrongAction = await operator(confirmArgs({ action: "reject" }), withKey);
  assert.notEqual(wrongAction.code, 0);
  assert.match(wrongAction.out, /That is not what you asked to confirm/);
  assert.notEqual((await operator(confirmArgs({ subject: narratives[1]!.id }), withKey)).code, 0);
  assert.match((await operator(confirmArgs({ digest: "0".repeat(64) }), withKey)).out, /not the one whose digest you gave/);
  // A prefix of the digest is not accepted, however long: twelve characters can be collided.
  assert.match((await operator(confirmArgs({ digest: digest.slice(0, 12) }), withKey)).out, /whole 64-character request digest/);
  assert.match((await operator(confirmArgs({ digest: digest.slice(0, 63) }), withKey)).out, /whole 64-character request digest/);
  assert.notEqual((await operator(confirmArgs({ request: "req-nope" }), withKey)).code, 0);
  assert.notEqual((await operator(["list"], env)).code, 0, "without the key the tool refuses to run");
  assert.equal((await agent.getCampaign(campaign.id)).decisions.length, 0, "none of the refused attempts recorded anything");

  // The reviewer's attack: the agent rewrites the notice so that it describes a different
  // request. The tool takes nothing from the notice but the pointer and the code, so what
  // it shows, and what it would sign, is unchanged.
  const noticePath = join(env.KIC_OPERATOR_DIR, `${select.requestId}.json`);
  const forged = { ...JSON.parse(readFileSync(noticePath, "utf8")), summary: `reject narrative ${narratives[1]!.id}`, subject: { kind: "narrative", id: narratives[1]!.id }, action: "reject", content: { title: "Forged", text: "Invented text." } };
  (await import("node:fs")).writeFileSync(noticePath, JSON.stringify(forged));
  const reshown = await operator(["show", "--request", select.requestId], withKey);
  assert.match(reshown.out, new RegExp(`YOU ARE ASKED TO: SELECT narrative ${narratives[0]!.id}`));
  assert.ok(!reshown.out.includes("Invented text."), "nothing from the notice file is displayed");
  // A malformed file in the channel does not stop the tool.
  (await import("node:fs")).writeFileSync(join(env.KIC_OPERATOR_DIR, "garbage.json"), "{not json");
  assert.match((await operator(["list"], withKey)).out, new RegExp(select.requestId));

  const confirmed = await operator(confirmArgs(), withKey);
  assert.equal(confirmed.code, 0, confirmed.out);
  assert.match(confirmed.out, /decision 1 in this campaign\): select narrative .* signed with key [0-9a-f]{16}/);
  assert.ok(!existsSync(noticePath), "the notice is removed once acted on");

  const verifier = verifierFromPublicKeyPem(readFileSync(`${keyFile}.pub`, "utf8"));
  let record = await agent.getCampaign(campaign.id);
  assert.equal(record.narratives[0]!.status, "selected");
  assert.equal(record.decisions.length, 1);
  assert.equal(record.decisions[0]!.actor.name, "Test Editor");
  assert.equal(verifyDecisionLog(record, verifier).ok, true, "the decision log is intact and validly signed");
  assert.ok(existsSync(`${keyFile}.ledger.json`), "the operator's ledger is kept beside the key");
  assert.equal(JSON.parse(readFileSync(`${keyFile}.ledger.json`, "utf8"))[campaign.id].sequence, 1, "and records how far this campaign's log has reached");

  // decline closes the request at once.
  const reject = await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[1]!.id }, action: "reject", proposedRationale: "Weaker.", requestedBy: "agent" });
  const declined = await operator(["decline", "--request", reject.requestId], withKey);
  assert.equal(declined.code, 0, declined.out);
  record = await agent.getCampaign(campaign.id);
  assert.equal(record.decisionRequests.find((r) => r.id === reject.requestId)!.state, "voided");
  assert.equal(record.narratives[1]!.status, "candidate");
  assert.match((await operator(["list"], withKey)).out, /No decisions are waiting/);

  // Release: refused while nothing is approved; refused if the store has lost a decision the ledger knows of.
  const early = await operator(["release", "--campaign", campaign.id, "--id", "editor-1", "--name", "Test Editor", "--reason", "Go."], withKey);
  assert.notEqual(early.code, 0);
  const store = new FileCampaignStore(join(env.KIC_DATA_DIR, "campaigns"));
  await store.update(campaign.id, (r) => {
    r.decisions.pop();
    r.narratives[0]!.status = "candidate";
  });
  const rolledBack = await operator(["release", "--campaign", campaign.id, "--id", "editor-1", "--name", "Test Editor", "--reason", "Go."], withKey);
  assert.notEqual(rolledBack.code, 0);
  assert.match(rolledBack.out, /rolled back or altered/);

  // A different key is refused: it does not match the instance's public key.
  const otherKey = join(base, "editor-home", "other.pem");
  await operator(["init", "--key", otherKey], env);
  const mismatched = await operator(["list"], { ...env, KIC_OPERATOR_KEY_FILE: otherKey });
  assert.notEqual(mismatched.code, 0);
  assert.match(mismatched.out, /does not match/);

  // init never leaves half a pair: with the public half already present, nothing is written.
  const half = join(base, "editor-home", "half.pem");
  (await import("node:fs")).writeFileSync(`${half}.pub`, "existing");
  assert.notEqual((await operator(["init", "--key", half], env)).code, 0);
  assert.ok(!existsSync(half), "no private key is left without its public half");
});

test("the operator tool releases a fully approved programme, signed, and only from an intact log", async () => {
  const base = mkdtempSync(join(tmpdir(), "kic-release-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  (await import("node:fs")).mkdirSync(join(base, "editor-home"), { recursive: true });
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_OPERATOR_KEY_FILE: keyFile,
    KIC_MODEL_MODE: "fixture",
    KIC_FIXTURE_DIR: resolve("fixtures/llm/synthetic-harbourline"),
  };
  assert.equal((await operator(["init", "--key", keyFile], env)).code, 0);
  const { service: agent, config } = createRuntime(loadRuntimeConfig(env, REPO));

  // The editor's side of each decision, through the real tool: show, then confirm what was shown.
  const decideWithTool = async (requestId: string) => {
    const shown = (await operator(["show", "--request", requestId], env)).out;
    const [, action, , subject] = /YOU ARE ASKED TO: (\S+) (\S+) (\S+)/.exec(shown)!;
    const digest = /Request digest: ([0-9a-f]{64})/.exec(shown)![1]!;
    const done = await operator(["confirm", "--request", requestId, "--action", action!.toLowerCase(), "--subject", subject!, "--digest", digest, "--id", "editor-1", "--name", "Test Editor", "--reason", "Read and agreed."], env);
    assert.equal(done.code, 0, done.out);
  };

  const campaign = await agent.createCampaign(syntheticBrief());
  await agent.interpretBrief(campaign.id);
  const narratives = await agent.generateNarratives(campaign.id, 3);
  await decideWithTool((await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Best.", requestedBy: "agent" })).requestId);
  await agent.planProgramme(campaign.id);
  const drafts = await agent.generateDrafts(campaign.id, { variants: 2 });
  const evaluations = await agent.evaluateDrafts(campaign.id);
  for (const evaluation of evaluations) {
    const pick = evaluation.ranking[0]!;
    assert.ok(drafts.some((d) => d.id === pick));
    await decideWithTool((await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "draft", id: pick }, action: "approve", proposedRationale: "Top.", requestedBy: "agent" })).requestId);
  }

  const released = await operator(["release", "--campaign", campaign.id, "--id", "editor-1", "--name", "Test Editor", "--reason", "Ready for the client."], env);
  assert.equal(released.code, 0, released.out);
  assert.match(released.out, /Released prog-.* \(complete\): 4 approved post\(s\), on 5 recorded decision\(s\)/);
  const packagePath = /(\S+programme\.json)/.exec(released.out)![1]!;
  assert.ok(packagePath.startsWith(config.exportDir));
  const pkg = ProgrammePackage.parse(JSON.parse(readFileSync(packagePath, "utf8")));
  const verifier = verifierFromPublicKeyPem(readFileSync(`${keyFile}.pub`, "utf8"));
  assert.equal(releaseIsValid(pkg, verifier), true);
  assert.equal(pkg.release!.releasedBy.name, "Test Editor");
  assert.equal(pkg.release!.decisionLogSequence, 5);
  assert.ok(pkg.provisionalCommands.every((c) => c.status === "NON-EXECUTABLE" && c.approval.signatureVerified));
  const commandsFile = JSON.parse(readFileSync(join(packagePath, "..", "provisional-commands.NON-EXECUTABLE.json"), "utf8")) as { released: boolean; decisionsVerified: boolean; commands: unknown[] };
  assert.deepEqual([commandsFile.released, commandsFile.decisionsVerified, commandsFile.commands.length], [true, true, 4]);
});

test("a planted notice cannot make the operator tool delete anything outside the channel", async () => {
  // The reviewer's attack: a notice whose requestId is a path, so that clearing the
  // "stale" notice deletes the operator's ledger.
  const fs = await import("node:fs");
  const base = mkdtempSync(join(tmpdir(), "kic-traversal-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  fs.mkdirSync(join(base, "editor-home"), { recursive: true });
  fs.mkdirSync(join(base, "operator-channel"), { recursive: true });
  const env = {
    KIC_DATA_DIR: join(base, "instance", "data"),
    KIC_OPERATOR_DIR: join(base, "operator-channel"),
    KIC_DECISION_PUBLIC_KEY_FILE: `${keyFile}.pub`,
    KIC_OPERATOR_KEY_FILE: keyFile,
    KIC_MODEL_MODE: "fixture",
  };
  assert.equal((await operator(["init", "--key", keyFile], env)).code, 0);
  const before = readdirSync(join(base, "editor-home")).sort();
  for (const [file, requestId] of [
    ["evil-1.json", "../editor-home/operator-key.pem.ledger"],
    ["evil-2.json", "../editor-home/operator-key.pem"],
    ["evil-3.json", "/etc/hostname"],
    ["evil-4.json", "evil-4/../../editor-home/operator-key.pem.ledger"],
  ] as const) {
    fs.writeFileSync(join(env.KIC_OPERATOR_DIR, file), JSON.stringify({ requestId, campaignId: "camp-000", code: "x", expiresAt: "2026-01-01T00:00:00.000Z" }));
  }
  // A well-formed notice for a campaign that does not exist is treated as stale and removed. Nothing else is.
  fs.writeFileSync(join(env.KIC_OPERATOR_DIR, "req-stale.json"), JSON.stringify({ requestId: "req-stale", campaignId: "camp-000", code: "x", expiresAt: "2026-01-01T00:00:00.000Z" }));
  const listed = await operator(["list"], env);
  assert.equal(listed.code, 0, listed.out);
  assert.match(listed.out, /No decisions are waiting/);
  assert.match(listed.out, /Ignored an unreadable file in the operator channel: evil-1\.json/);
  assert.deepEqual(readdirSync(join(base, "editor-home")).sort(), before, "the key, its public half and the ledger are untouched");
  assert.ok(!existsSync(join(env.KIC_OPERATOR_DIR, "req-stale.json")));
  assert.ok(existsSync(join(env.KIC_OPERATOR_DIR, "evil-1.json")), "a malformed notice is ignored, not acted on");

  // The channel refuses to clear anything that is not a plain request id.
  const channel = new FileOperatorChannel(env.KIC_OPERATOR_DIR);
  await channel.clear("../editor-home/operator-key.pem.ledger");
  await channel.clear("../editor-home/operator-key.pem");
  assert.deepEqual(readdirSync(join(base, "editor-home")).sort(), before);
});

test("a missing ledger stops the operator tool instead of silently trusting the store", async () => {
  const fs = await import("node:fs");
  const base = mkdtempSync(join(tmpdir(), "kic-ledger-"));
  const keyFile = join(base, "editor-home", "operator-key.pem");
  fs.mkdirSync(join(base, "editor-home"), { recursive: true });
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
  const request = await agent.requestDecision({ campaignId: campaign.id, subject: { kind: "narrative", id: narratives[0]!.id }, action: "select", proposedRationale: "Best.", requestedBy: "agent" });

  // The ledger disappears: deleted, or the key was moved to a new machine without it.
  fs.unlinkSync(`${keyFile}.ledger.json`);
  for (const args of [["list"], ["show", "--request", request.requestId], ["release", "--campaign", campaign.id, "--id", "e", "--name", "E", "--reason", "r"]]) {
    const out = await operator(args, env);
    if (args[0] === "show") continue; // show reads the record only; it signs nothing
    assert.notEqual(out.code, 0, args.join(" "));
    assert.match(out.out, /ledger is missing/);
  }
  const shown = (await operator(["show", "--request", request.requestId], env)).out;
  const digest = /Request digest: ([0-9a-f]{64})/.exec(shown)![1]!;
  const confirm = ["confirm", "--request", request.requestId, "--action", "select", "--subject", narratives[0]!.id, "--digest", digest, "--id", "e", "--name", "Editor", "--reason", "ok"];
  const refused = await operator(confirm, env);
  assert.notEqual(refused.code, 0);
  assert.match(refused.out, /ledger is missing/);
  assert.equal((await agent.getCampaign(campaign.id)).decisions.length, 0, "nothing was signed without the ledger");

  // Starting a new ledger is an explicit act.
  assert.match((await operator(["new-ledger"], env)).out, /--accept-current-state/);
  assert.equal((await operator(["new-ledger", "--accept-current-state"], env)).code, 0);
  assert.notEqual((await operator(["new-ledger", "--accept-current-state"], env)).code, 0, "an existing ledger is never replaced");
  assert.equal((await operator(confirm, env)).code, 0);
});

test("the instance refuses to start with an operator channel the agent runtime could read, or without a decision key", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "kic-cwd-"));
  const outside = mkdtempSync(join(tmpdir(), "kic-outside-"));
  const key = { KIC_DECISION_PUBLIC_KEY_FILE: join(outside, "key.pub") };
  assert.throws(() => loadRuntimeConfig({ ...key }, cwd), /KIC_OPERATOR_DIR/);
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: "operator" }, cwd), /outside the data directory and the working directory/);
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: join(cwd, "data", "operator") }, cwd), /outside/);
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: join(cwd, "sub", "..", "x") }, cwd), /outside/);
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_DATA_DIR: outside, KIC_OPERATOR_DIR: join(outside, "operator") }, cwd), /outside/);
  assert.throws(() => loadRuntimeConfig({ KIC_OPERATOR_DIR: outside }, cwd), /KIC_DECISION_PUBLIC_KEY_FILE/);
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: outside, KIC_MODEL_MODE: "turbo" }, cwd), /KIC_MODEL_MODE/);

  // The check follows links and is not fooled by names that merely begin with dots.
  const fs = await import("node:fs");
  fs.mkdirSync(join(cwd, "..op"));
  assert.equal(inside(cwd, join(cwd, "..op")), true);
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: join(cwd, "..op") }, cwd), /outside/);
  fs.mkdirSync(join(cwd, "real-operator"));
  fs.symlinkSync(join(cwd, "real-operator"), join(outside, "link-to-inside"));
  assert.throws(() => loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: join(outside, "link-to-inside") }, cwd), /outside/);
  assert.equal(inside(cwd, outside), false);

  const ok = loadRuntimeConfig({ ...key, KIC_OPERATOR_DIR: outside }, cwd);
  assert.equal(ok.operatorDir, outside);
  assert.equal(ok.evaluator, "mock-jev");
  // Unsigned decisions have to be asked for explicitly.
  assert.equal(loadRuntimeConfig({ KIC_OPERATOR_DIR: outside, KIC_ALLOW_UNSIGNED_DECISIONS: "1" }, cwd).decisionPublicKeyFile, null);
});
