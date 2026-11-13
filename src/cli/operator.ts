import { parseArgs } from "node:util";
import { createRuntime } from "../mcp/runtime.ts";

/**
 * The editor's own tool. It runs outside the agent runtime and is the only place the
 * one-time codes are shown.
 *
 *   node src/cli/operator.ts list
 *   node src/cli/operator.ts confirm --request <id> --id <your id> --name "<your name>" --reason "<why>"
 *   node src/cli/operator.ts decline --request <id>
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { request: { type: "string" }, id: { type: "string" }, name: { type: "string" }, reason: { type: "string" } },
});
const command = positionals[0] ?? "list";
const { service, operator } = createRuntime();
const pending = await operator.pending();

if (command === "list") {
  if (pending.length === 0) console.log("No decisions are waiting.");
  for (const notice of pending) {
    console.log(`${notice.requestId}  campaign ${notice.campaignId}  expires ${notice.expiresAt}\n  ${notice.summary}`);
  }
} else if (command === "confirm" || command === "decline") {
  const notice = pending.find((n) => n.requestId === values.request);
  if (!notice) throw new Error(`No waiting decision with id "${values.request ?? ""}".`);
  if (command === "confirm") {
    if (!values.id || !values.name || !values.reason) throw new Error("confirm needs --id, --name and --reason.");
    const decision = await service.confirmDecision({
      campaignId: notice.campaignId,
      requestId: notice.requestId,
      code: notice.code,
      actor: { kind: "human", id: values.id, name: values.name },
      rationale: values.reason,
    });
    console.log(`Recorded ${decision.id}: ${decision.action} ${decision.subject.kind} ${decision.subject.id}.`);
  } else {
    console.log(`Declined ${notice.requestId}. The request will expire unconfirmed.`);
  }
  await operator.clear(notice.requestId);
} else {
  throw new Error(`Unknown command "${command}". Use list, confirm or decline.`);
}
