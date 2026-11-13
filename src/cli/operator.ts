import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createOperatorRuntime } from "../mcp/runtime.ts";
import { generateDecisionKeyPair } from "../workflow/signing.ts";

/**
 * The editor's own tool. It runs outside the agent runtime, as a user or on a machine the
 * agent cannot reach, and it is the only place a decision can be recorded: it holds the
 * operator's private key, and the agent-facing server holds only the public half.
 *
 *   node src/cli/operator.ts init --key <private-key-file>     create the operator key pair
 *   node src/cli/operator.ts list                              decisions waiting
 *   node src/cli/operator.ts show --request <id>               the content to be decided on
 *   node src/cli/operator.ts confirm --request <id> --id <your id> --name "<your name>" --reason "<why>"
 *   node src/cli/operator.ts decline --request <id>
 *
 * The key file comes from --key or KIC_OPERATOR_KEY_FILE.
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" },
    request: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    reason: { type: "string" },
  },
});
const command = positionals[0] ?? "list";
const keyFile = values.key ?? process.env.KIC_OPERATOR_KEY_FILE;

async function writeNew(path: string, content: string, mode: number): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
}

if (command === "init") {
  if (!keyFile) throw new Error("init needs --key <file> for the new private key.");
  const pair = generateDecisionKeyPair();
  const privatePath = resolve(keyFile);
  const publicPath = `${privatePath}.pub`;
  // Exclusive create: an existing key is never overwritten.
  await writeNew(privatePath, pair.privateKeyPem, 0o600);
  await writeNew(publicPath, pair.publicKeyPem, 0o644);
  console.log(`Operator key ${pair.signer.keyId} created.`);
  console.log(`  Private key: ${privatePath}  (keep this where the agent runtime cannot read it)`);
  console.log(`  Public key:  ${publicPath}   (give this to the server as KIC_DECISION_PUBLIC_KEY_FILE)`);
} else {
  if (!keyFile) throw new Error("Set --key or KIC_OPERATOR_KEY_FILE to the operator's private key.");
  const { service, operator } = createOperatorRuntime(resolve(keyFile));
  const pending = await operator.pending();
  const find = () => {
    const notice = pending.find((n) => n.requestId === values.request);
    if (!notice) throw new Error(`No waiting decision with id "${values.request ?? ""}".`);
    return notice;
  };

  if (command === "list") {
    if (pending.length === 0) console.log("No decisions are waiting.");
    for (const n of pending) console.log(`${n.requestId}  campaign ${n.campaignId}  ${n.summary}  (${n.content.title})  expires ${n.expiresAt}`);
  } else if (command === "show") {
    const n = find();
    console.log(`Request ${n.requestId} in campaign ${n.campaignId}, expires ${n.expiresAt}`);
    console.log(`Asked to: ${n.summary}`);
    console.log(`Requested by: ${n.requestedBy}`);
    console.log(`Requester's reason (not verified): ${n.proposedRationale}`);
    if (n.revisionInstruction) console.log(`Revision instruction: ${n.revisionInstruction}`);
    console.log(`\n${n.content.title}\n${"-".repeat(60)}\n${n.content.text}`);
    if (n.content.hashtags.length) console.log(`\n${n.content.hashtags.join(" ")}`);
    console.log("-".repeat(60));
    console.log(n.content.evaluation ?? "Not evaluated.");
    if (n.content.eligibilityFailures.length) {
      console.log("FAILS MANDATORY CONSTRAINTS:");
      for (const failure of n.content.eligibilityFailures) console.log(`  - ${failure}`);
    } else if (n.content.kind === "draft") {
      console.log("Passes the mandatory constraints checked by code.");
    }
    console.log(`Content sha256: ${n.contentSha256}`);
  } else if (command === "confirm") {
    const n = find();
    if (!values.id || !values.name || !values.reason) throw new Error("confirm needs --id, --name and --reason.");
    const decision = await service.confirmDecision({
      campaignId: n.campaignId,
      requestId: n.requestId,
      code: n.code,
      actor: { kind: "human", id: values.id, name: values.name },
      rationale: values.reason,
    });
    await operator.clear(n.requestId);
    console.log(`Recorded ${decision.id}: ${decision.action} ${decision.subject.kind} ${decision.subject.id} (signed with key ${decision.signature?.keyId}).`);
  } else if (command === "decline") {
    const n = find();
    await service.declineDecision({ campaignId: n.campaignId, requestId: n.requestId, code: n.code });
    await operator.clear(n.requestId);
    console.log(`Declined ${n.requestId}. The request is closed.`);
  } else {
    throw new Error(`Unknown command "${command}". Use init, list, show, confirm or decline.`);
  }
}
