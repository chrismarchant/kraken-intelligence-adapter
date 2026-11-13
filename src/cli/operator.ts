import { open, rename, stat, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createOperatorRuntime } from "../mcp/runtime.ts";
import { systemClock } from "../util/runtime.ts";
import { assembleProgramme, exportProgramme, releaseProgramme } from "../workflow/assemble.ts";
import { FileOperatorLedger } from "../workflow/ledger.ts";
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
 *   node src/cli/operator.ts confirm --request <id> --action <action> --subject <id> --digest <request digest>
 *                                    --id <your id> --name "<your name>" --reason "<why>"
 *   node src/cli/operator.ts decline --request <id>
 *   node src/cli/operator.ts release --campaign <id> --id <your id> --name "<your name>" --reason "<why>" [--partial]
 *   node src/cli/operator.ts new-ledger --accept-current-state      only on a new operator machine, or after the ledger was lost
 *
 * The key file comes from --key or KIC_OPERATOR_KEY_FILE. `confirm` makes the editor name
 * the action and the subject, and give the whole request digest that `show` displayed. The
 * digest covers the request, its action, subject, any revision instruction and the exact
 * content, so that what is signed is what was read.
 */
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" },
    request: { type: "string" },
    campaign: { type: "string" },
    action: { type: "string" },
    subject: { type: "string" },
    digest: { type: "string" },
    "accept-current-state": { type: "boolean", default: false },
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
      // The ledger starts empty, with the key. From here on a missing ledger is an error.
      await new FileOperatorLedger(`${privatePath}.ledger.json`).create();
      await rename(publicTemp, publicPath);
      await rename(privateTemp, privatePath);
    } catch (error) {
      await unlink(privateTemp).catch(() => undefined);
      await unlink(publicTemp).catch(() => undefined);
      throw error;
    }
    console.log(`Operator key ${pair.signer.keyId} created.`);
    console.log(`  Private key: ${privatePath}  (keep this where the agent runtime cannot read it)`);
    console.log(`  Ledger:      ${privatePath}.ledger.json  (keep this with the key; if it is lost, removed decisions go undetected)`);
    console.log(`  Public key:  ${publicPath}   (give this to the server as KIC_DECISION_PUBLIC_KEY_FILE)`);
  } else {
    if (!keyFile) throw new Error("Set --key or KIC_OPERATOR_KEY_FILE to the operator's private key.");
    if (command === "new-ledger") {
      if (!values["accept-current-state"]) {
        throw new Error("new-ledger starts trusting every campaign's decision log as it stands now. If that is intended, add --accept-current-state.");
      }
      await new FileOperatorLedger(`${resolve(keyFile)}.ledger.json`).create();
      console.log("A new, empty ledger was created. Decision logs are trusted as they stand from this point.");
      return;
    }
    const { service, operator, config } = createOperatorRuntime(resolve(keyFile));

    if (command === "release") {
      if (!values.campaign || !values.id || !values.name || !values.reason) throw new Error("release needs --campaign, --id, --name and --reason.");
      // The decision log is checked against the operator's own ledger before anything is signed,
      // and the package is assembled from the very record that was checked.
      const { record, head: logHead } = await service.checkedRecord(values.campaign);
      const preview = assembleProgramme(record, { allowPartial: values.partial, clock: systemClock, limits: service.limits, verifier: service.verifier });
      const released = releaseProgramme(preview, {
        actor: { kind: "human", id: values.id, name: values.name },
        rationale: values.reason,
        logHead,
        sign: (statement) => service.signRelease(statement),
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
          // If an earlier run stopped between storing a decision and noting it, note it now.
          await service.advanceLedger(n.campaignId);
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
        for (const part of d.content.unpublished) console.log(`${part.label} (recorded, not published): ${part.text}`);
        console.log(d.content.evaluation ?? "Not evaluated.");
        if (d.content.eligibilityFailures.length) {
          console.log("FAILS MANDATORY CONSTRAINTS:");
          for (const failure of d.content.eligibilityFailures) console.log(`  - ${failure}`);
        } else if (d.subject.kind === "draft") {
          console.log("Passes the mandatory constraints checked by code.");
        }
        if (!d.unchanged) console.log("THE CONTENT HAS CHANGED SINCE THIS REQUEST WAS MADE. It cannot be confirmed.");
        console.log(`Content sha256: ${d.contentSha256}`);
        console.log(`Request digest: ${d.digest}`);
        console.log(`\nTo confirm: confirm --request ${d.requestId} --action ${d.action} --subject ${d.subject.id} --digest ${d.digest} --id <you> --name "<your name>" --reason "<why>"`);
      } else if (command === "confirm") {
        const n = find();
        if (!values.id || !values.name || !values.reason) throw new Error("confirm needs --id, --name and --reason.");
        if (!values.action || !values.subject || !values.digest) throw new Error("confirm needs --action, --subject and --digest, exactly as `show` displayed them.");
        // The whole digest, not a prefix: a short prefix can be matched by a second, different request.
        if (!/^[0-9a-f]{64}$/.test(values.digest)) throw new Error("--digest must be the whole 64-character request digest that `show` displayed.");
        const d = await service.describeRequest(n.campaignId, n.requestId);
        if (values.action !== d.action || values.subject !== d.subject.id) {
          throw new Error(`Request ${d.requestId} is to ${d.action} ${d.subject.kind} ${d.subject.id}. That is not what you asked to confirm. Nothing was recorded.`);
        }
        if (d.digest !== values.digest) {
          throw new Error("The request is not the one whose digest you gave: its content, action, subject or revision instruction differs. Run `show` again and read it. Nothing was recorded.");
        }
        const decision = await service.confirmDecision({
          campaignId: n.campaignId,
          requestId: n.requestId,
          code: n.code,
          actor: { kind: "human", id: values.id, name: values.name },
          rationale: values.reason,
          // What the editor typed, not what was just read: the service checks it against the record under the lock.
          expected: { digest: values.digest },
        });
        await operator.clear(n.requestId);
        console.log(`Recorded ${decision.id} (decision ${decision.sequence} in this campaign): ${decision.action} ${decision.subject.kind} ${decision.subject.id}, signed with key ${decision.signature?.keyId}.`);
      } else if (command === "decline") {
        const n = find();
        await service.declineDecision({ campaignId: n.campaignId, requestId: n.requestId, code: n.code });
        await operator.clear(n.requestId);
        console.log(`Declined ${n.requestId}. The request is closed.`);
      } else {
        throw new Error(`Unknown command "${command}". Use init, list, show, confirm, decline, release or new-ledger.`);
      }
    }
  }
}

// A refusal is reported in one plain line. Nothing was recorded unless the tool said so.
main().catch((error: unknown) => {
  console.error(`Refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
