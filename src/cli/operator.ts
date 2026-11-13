import { open, rename, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createOperatorRuntime } from "../mcp/runtime.ts";
import { systemClock } from "../util/runtime.ts";
import { assembleProgramme, exportProgramme, releaseProgramme } from "../workflow/assemble.ts";
import { generateDecisionKeyPair } from "../workflow/signing.ts";

/**
 * The editor's own tool. It runs outside the agent runtime, as a user or on a machine the
 * agent cannot reach, and it is the only place a decision is recorded or a programme is
 * released: it holds the operator's private key, and the agent-facing server holds only
 * the public half.
 *
 * Everything shown here is read from the campaign record. The operator channel only says
 * that a request is waiting; it is never trusted for what the request is.
 *
 *   node src/cli/operator.ts init --key <private-key-file>
 *   node src/cli/operator.ts list
 *   node src/cli/operator.ts show --request <id>
 *   node src/cli/operator.ts confirm --request <id> --action <action> --subject <id> --sha <first 12 of content sha>
 *                                    --id <your id> --name "<your name>" --reason "<why>"
 *   node src/cli/operator.ts decline --request <id>
 *   node src/cli/operator.ts release --campaign <id> --id <your id> --name "<your name>" --reason "<why>" [--partial]
 *
 * The key file comes from --key or KIC_OPERATOR_KEY_FILE. `confirm` makes the editor name
 * the action, the subject and the start of the content hash that `show` displayed, so that
 * what is signed is what was read.
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" },
    request: { type: "string" },
    campaign: { type: "string" },
    action: { type: "string" },
    subject: { type: "string" },
    sha: { type: "string" },
    id: { type: "string" },
    name: { type: "string" },
    reason: { type: "string" },
    partial: { type: "boolean", default: false },
  },
});
const command = positionals[0] ?? "list";
const keyFile = values.key ?? process.env.KIC_OPERATOR_KEY_FILE;

async function writeNew(path: string, content: string, mode: number): Promise<void> {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const exists = (path: string) => stat(path).then(() => true, () => false);

async function main(): Promise<void> {
  if (command === "init") {
    if (!keyFile) throw new Error("init needs --key <file> for the new private key.");
    const privatePath = resolve(keyFile);
    const publicPath = `${privatePath}.pub`;
    // Neither half of an existing pair is ever overwritten, and a pair is never left half-written:
    // both files are written under temporary names and moved into place only when both exist.
    if ((await exists(privatePath)) || (await exists(publicPath))) throw new Error(`A key already exists at ${privatePath} or ${publicPath}. Nothing was changed.`);
    const pair = generateDecisionKeyPair();
    const [privateTemp, publicTemp] = [`${privatePath}.new`, `${publicPath}.new`];
    try {
      await writeNew(privateTemp, pair.privateKeyPem, 0o600);
      await writeNew(publicTemp, pair.publicKeyPem, 0o644);
      await rename(publicTemp, publicPath);
      await rename(privateTemp, privatePath);
    } catch (error) {
      await unlink(privateTemp).catch(() => undefined);
      await unlink(publicTemp).catch(() => undefined);
      throw error;
    }
    console.log(`Operator key ${pair.signer.keyId} created.`);
    console.log(`  Private key: ${privatePath}  (keep this, and its ledger file, where the agent runtime cannot read or write)`);
    console.log(`  Public key:  ${publicPath}   (give this to the server as KIC_DECISION_PUBLIC_KEY_FILE)`);
  } else {
    if (!keyFile) throw new Error("Set --key or KIC_OPERATOR_KEY_FILE to the operator's private key.");
    const { service, operator, config } = createOperatorRuntime(resolve(keyFile));

    if (command === "release") {
      if (!values.campaign || !values.id || !values.name || !values.reason) throw new Error("release needs --campaign, --id, --name and --reason.");
      // The decision log is checked against the operator's own ledger before anything is signed.
      const logHead = await service.decisionLogHead(values.campaign);
      const record = await service.getCampaign(values.campaign);
      const preview = assembleProgramme(record, { allowPartial: values.partial, clock: systemClock, limits: service.limits, verifier: service.verifier });
      const released = releaseProgramme(preview, {
        actor: { kind: "human", id: values.id, name: values.name },
        rationale: values.reason,
        logHead,
        sign: (digest) => service.signRelease(digest),
        clock: systemClock,
      });
      const exported = await exportProgramme(released, config.exportDir);
      console.log(`Released ${released.programmeId} (${released.approvalState}): ${released.provisionalCommands.length} approved post(s), on ${logHead.sequence} recorded decision(s).`);
      for (const post of released.posts) console.log(`  post ${post.slot.slot}: ${post.state}${post.approvedDraft ? ` (${post.approvedDraft.id})` : ""}`);
      console.log(`  ${exported.packagePath}`);
      console.log(`  package sha256 ${exported.packageSha256}; signed with key ${released.release?.signature?.keyId ?? "none"}`);
    } else {
      const notices = await operator.pending();
      for (const name of operator.skipped) console.error(`Ignored an unreadable file in the operator channel: ${name}`);
      const find = () => {
        const notice = notices.find((n) => n.requestId === values.request);
        if (!notice) throw new Error(`No waiting decision with id "${values.request ?? ""}".`);
        return notice;
      };

      if (command === "list") {
        let waiting = 0;
        for (const n of notices) {
          // What a request is comes from the campaign record, never from the channel.
          const described = await service.describeRequest(n.campaignId, n.requestId).catch(() => null);
          if (!described || described.state !== "pending") {
            await operator.clear(n.requestId);
            continue;
          }
          waiting += 1;
          console.log(`${described.requestId}  campaign ${described.campaignId}  ${described.action} ${described.subject.kind} ${described.subject.id}  (${described.content.title})  expires ${described.expiresAt}`);
        }
        if (waiting === 0) console.log("No decisions are waiting.");
      } else if (command === "show") {
        const n = find();
        const d = await service.describeRequest(n.campaignId, n.requestId);
        console.log(`Request ${d.requestId} in campaign ${d.campaignId} — ${d.state}, expires ${d.expiresAt}`);
        console.log(`YOU ARE ASKED TO: ${d.action.toUpperCase()} ${d.subject.kind} ${d.subject.id}`);
        console.log(`Requested by: ${d.requestedBy}`);
        console.log(`Requester's reason (not verified): ${d.proposedRationale}`);
        if (d.revisionInstruction) console.log(`Revision instruction: ${d.revisionInstruction}`);
        console.log(`\n${d.content.title}\n${"-".repeat(60)}\n${d.content.text}`);
        if (d.content.hashtags.length) console.log(`\n${d.content.hashtags.join(" ")}`);
        console.log("-".repeat(60));
        console.log(d.content.evaluation ?? "Not evaluated.");
        if (d.content.eligibilityFailures.length) {
          console.log("FAILS MANDATORY CONSTRAINTS:");
          for (const failure of d.content.eligibilityFailures) console.log(`  - ${failure}`);
        } else if (d.subject.kind === "draft") {
          console.log("Passes the mandatory constraints checked by code.");
        }
        if (!d.unchanged) console.log("THE CONTENT HAS CHANGED SINCE THIS REQUEST WAS MADE. It cannot be confirmed.");
        console.log(`Content sha256: ${d.contentSha256}`);
        console.log(`\nTo confirm: confirm --request ${d.requestId} --action ${d.action} --subject ${d.subject.id} --sha ${d.contentSha256.slice(0, 12)} --id <you> --name "<your name>" --reason "<why>"`);
      } else if (command === "confirm") {
        const n = find();
        if (!values.id || !values.name || !values.reason) throw new Error("confirm needs --id, --name and --reason.");
        if (!values.action || !values.subject || !values.sha) throw new Error("confirm needs --action, --subject and --sha, exactly as `show` displayed them.");
        if (values.sha.length < 12) throw new Error("--sha needs at least the first 12 characters of the content hash.");
        const d = await service.describeRequest(n.campaignId, n.requestId);
        if (values.action !== d.action || values.subject !== d.subject.id) {
          throw new Error(`Request ${d.requestId} is to ${d.action} ${d.subject.kind} ${d.subject.id}. That is not what you asked to confirm. Nothing was recorded.`);
        }
        if (!d.contentSha256.startsWith(values.sha.toLowerCase())) {
          throw new Error("The content is not the content whose hash you gave. Run `show` again and read it. Nothing was recorded.");
        }
        const decision = await service.confirmDecision({
          campaignId: n.campaignId,
          requestId: n.requestId,
          code: n.code,
          actor: { kind: "human", id: values.id, name: values.name },
          rationale: values.reason,
          expected: { action: d.action, subject: d.subject, contentSha256: d.contentSha256 },
        });
        await operator.clear(n.requestId);
        console.log(`Recorded ${decision.id} (decision ${decision.sequence} in this campaign): ${decision.action} ${decision.subject.kind} ${decision.subject.id}, signed with key ${decision.signature?.keyId}.`);
      } else if (command === "decline") {
        const n = find();
        await service.declineDecision({ campaignId: n.campaignId, requestId: n.requestId, code: n.code });
        await operator.clear(n.requestId);
        console.log(`Declined ${n.requestId}. The request is closed.`);
      } else {
        throw new Error(`Unknown command "${command}". Use init, list, show, confirm, decline or release.`);
      }
    }
  }
}

// A refusal is reported in one plain line. Nothing was recorded unless the tool said so.
main().catch((error: unknown) => {
  console.error(`Refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
