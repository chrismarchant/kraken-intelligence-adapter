import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  CampaignBrief,
  HumanActor,
  NON_EXECUTABLE_NOTICE,
  PROVISIONAL_COMMAND_SCHEMA,
  ProvisionalPublishCommand,
} from "../../src/contracts/index.ts";
import { syntheticBrief } from "./support.ts";

const validCommand = () => ({
  schema: PROVISIONAL_COMMAND_SCHEMA,
  status: "NON-EXECUTABLE",
  authoritative: false,
  executable: false,
  notice: NON_EXECUTABLE_NOTICE,
  commandId: "cmd-prog-camp-001-01",
  programmeId: "prog-camp-001",
  channel: "linkedin",
  kind: "organic-post",
  sequence: { slot: 1, week: 1, orderInWeek: 1 },
  content: { draftId: "draft-001", body: "Body", hashtags: ["#Ops"], bodySha256: "a".repeat(64) },
  approval: { decisionId: "dec-001", approvedBy: { kind: "human", id: "e1", name: "Editor" }, approvedAt: "2026-01-05T09:00:00.000Z" },
  translation: { target: "kraken", contract: null, note: "None accepted." },
});

test("the synthetic brief is valid and marked synthetic", () => {
  const brief = CampaignBrief.parse(syntheticBrief());
  assert.equal(brief.synthetic, true);
  assert.match(brief.client.name, /fictional/);
});

test("a brief with an unknown field is refused", () => {
  const result = CampaignBrief.safeParse({ ...syntheticBrief(), publishNow: true });
  assert.equal(result.success, false);
});

test("a provisional command is valid only when non-executable and non-authoritative", () => {
  assert.equal(ProvisionalPublishCommand.safeParse(validCommand()).success, true);
  for (const [field, value] of [
    ["executable", true],
    ["authoritative", true],
    ["status", "READY"],
    ["status", "EXECUTABLE"],
    ["notice", "go ahead"],
  ] as const) {
    assert.equal(ProvisionalPublishCommand.safeParse({ ...validCommand(), [field]: value }).success, false, `${field}=${String(value)} must be refused`);
  }
});

test("a provisional command cannot carry an endpoint, credential, account or clock time", () => {
  for (const extra of [{ endpoint: "https://example.invalid" }, { accessToken: "x" }, { accountId: "123" }, { scheduledAt: "2026-02-01T09:00:00Z" }, { publishAt: "now" }]) {
    assert.equal(ProvisionalPublishCommand.safeParse({ ...validCommand(), ...extra }).success, false, `${Object.keys(extra)[0]} must be refused`);
  }
  const withTime = validCommand();
  (withTime.sequence as Record<string, unknown>).date = "2026-02-01";
  assert.equal(ProvisionalPublishCommand.safeParse(withTime).success, false);
});

test("a provisional command cannot name an accepted Kraken contract", () => {
  const command = validCommand();
  (command.translation as Record<string, unknown>).contract = "kraken/v1";
  assert.equal(ProvisionalPublishCommand.safeParse(command).success, false);
});

test("the exported JSON Schema pins the guard fields to constants", () => {
  const schema = z.toJSONSchema(ProvisionalPublishCommand) as unknown as { properties: Record<string, { const?: unknown }>; additionalProperties?: boolean };
  assert.equal(schema.properties.executable?.const, false);
  assert.equal(schema.properties.authoritative?.const, false);
  assert.equal(schema.properties.status?.const, "NON-EXECUTABLE");
  assert.equal(schema.additionalProperties, false);
});

test("only a human can be the actor of a decision", () => {
  assert.equal(HumanActor.safeParse({ kind: "human", id: "e1", name: "Editor" }).success, true);
  for (const kind of ["agent", "model", "service", "system"]) {
    assert.equal(HumanActor.safeParse({ kind, id: "a1", name: "Agent" }).success, false, `${kind} must be refused`);
  }
  assert.equal(HumanActor.safeParse({ kind: "human", id: "", name: "Editor" }).success, false);
});
