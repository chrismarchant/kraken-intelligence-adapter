import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ProgrammePackage } from "../contracts/index.ts";
import { createOperatorRuntime, inside } from "../mcp/runtime.ts";
import { canonicalJson, displaySafe, fitToWidth, systemClock } from "../util/runtime.ts";
import { assembleProgramme, exportProgramme, packageDigest, releaseDigest, releaseIsValid, releaseProgramme } from "../workflow/assemble.ts";
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
 *   node src/cli/operator.ts review --campaign <id> [--partial]
 *   node src/cli/operator.ts release --campaign <id> --digest <release digest> --id <your id> --name "<your name>" --reason "<why>" [--partial]
 *   node src/cli/operator.ts verify --package <programme.json>
 *   node src/cli/operator.ts new-ledger --accept-current-state      only on a new operator machine, or after the ledger was lost
 *
 * The key file comes from --key or KIC_OPERATOR_KEY_FILE. `confirm` makes the editor name
 * the action and the subject, and give the whole request digest that `show` displayed. The
 * digest covers the request, its action, subject, any revision instruction and the exact
 * content, so that what is signed is what was read. `release` works the same way: `review`
 * shows the brief's constraints, the plan and every approved post, and gives the digest that
 * `release` must be given back.
 *
 * Everything read from a campaign record is printed with control, invisible and direction
 * characters and runs of spaces written out as visible codes, and always behind a margin:
 * a line of stored text starts with "  | ", and when it is too long for the terminal the
 * rest follows on lines that start with "  |     ". Nothing stored ever starts in the first
 * column, where this tool's own lines start, so stored text cannot move the cursor, erase a
 * line, or pass for a line of this tool's own or for the start of another stored line.
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
    package: { type: "string" },
  },
});

/**
 * Terminal width to break lines at: the terminal's own when there is one; otherwise
 * KIC_OPERATOR_COLUMNS if it is set, and failing that 72, so that output piped to a pager
 * still fits a narrow window.
 */
const DECLARED = /^[0-9]{2,3}$/.test(process.env.KIC_OPERATOR_COLUMNS ?? "") ? Number(process.env.KIC_OPERATOR_COLUMNS) : 72;
const WIDTH = Math.max(40, Math.min(process.stdout.isTTY ? (process.stdout.columns ?? 80) : DECLARED, 160)) - 1;
const LINE = "  | "; // where a line of stored text starts
const REST = "  |     "; // where the rest of a line that was too long continues

/**
 * Stored text, safe to print and behind the margin. `lead` is this tool's own label for
 * the first line, inside the margin. With `multiline`, the text's own line feeds start new
 * stored lines; without it they are written out as codes and the whole is one stored line.
 */
function stored(text: string, options: { lead?: string; multiline?: boolean } = {}): string {
  return displaySafe(text, { multiline: options.multiline })
    .split("\n")
    .flatMap((line, index) => fitToWidth((index === 0 ? (options.lead ?? "") : "") + line, WIDTH - REST.length).map((piece, part) => (part === 0 ? LINE : REST) + piece))
    .join("\n");
}

/** A label of this tool's own, then the stored text it introduces on the lines below it. */
const labelled = (label: string, text: string) => `${label}\n${stored(text)}`;

/**
 * Every value in a document, one stored line each, with its place in the document:
 * "plan.slots[2].theme: ...". The place names are this program's own field names.
 */
function everyValue(value: unknown, path = ""): string[] {
  if (value === undefined) return [];
  // Text is introduced by a colon; anything that is not text (a number, yes or no, nothing, an
  // empty list) by an equals sign, so that the text "null" and an absent value do not look alike.
  if (typeof value === "string") return [stored(value, { lead: `${path}: ` })];
  if (value === null || typeof value !== "object") return [stored(String(value), { lead: `${path} = ` })];
  if (Array.isArray(value)) return value.length === 0 ? [stored("(empty)", { lead: `${path} = ` })] : value.flatMap((item, index) => everyValue(item, `${path}[${index + 1}]`));
  return Object.entries(value).flatMap(([key, item]) => everyValue(item, path ? `${path}.${displaySafe(key)}` : displaySafe(key)));
}

/** An id, an enumerated word or a timestamp: values whose form the record's schema already fixes. */
const one = (text: string) => displaySafe(text);
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

    if (command === "verify") {
      if (!values.package) throw new Error("verify needs --package <programme.json>.");
      const path = resolve(values.package);
      const pkg = ProgrammePackage.parse(JSON.parse(await readFile(path, "utf8")));
      if (!releaseIsValid(pkg, service.verifier)) {
        throw new Error("This package is not a release signed with this operator key, or it was changed after it was released.");
      }
      console.log(`${one(pkg.programmeId)}: released at ${one(pkg.release?.releasedAt ?? "")}, signature valid, content unchanged.`);
      console.log(labelled("Released by:", pkg.release?.releasedBy.name ?? ""));
      // The commands file beside it, if there is one, must say exactly what the package says.
      const commandsPath = join(dirname(path), "provisional-commands.NON-EXECUTABLE.json");
      const beside = await readFile(commandsPath, "utf8").then((text) => JSON.parse(text) as { commands?: unknown; packageSha256?: unknown }, () => null);
      if (beside === null) console.log("  No commands file beside it.");
      else if (beside.packageSha256 !== packageDigest(pkg) || canonicalJson(beside.commands) !== canonicalJson(pkg.provisionalCommands)) {
        throw new Error("The commands file beside the package does not match the released package. Use the commands inside programme.json only.");
      } else console.log(`  The commands file beside it matches: ${pkg.provisionalCommands.length} NON-EXECUTABLE command(s).`);
      return;
    }

    if (command === "review" || command === "release") {
      if (!values.campaign) throw new Error(`${command} needs --campaign.`);
      if (command === "release" && (!values.id || !values.name || !values.reason)) throw new Error("release needs --campaign, --digest, --id, --name and --reason.");
      if (command === "release" && !/^[0-9a-f]{64}$/.test(values.digest ?? "")) {
        throw new Error("release needs --digest: the whole 64-character release digest that `review` displayed.");
      }
      // Releases are kept on the operator's side, beside the key, unless told otherwise, and never
      // where the agent runtime can write: checked before anything is read or signed.
      const releaseDir = process.env.KIC_RELEASE_DIR ? resolve(process.env.KIC_RELEASE_DIR) : join(dirname(resolve(keyFile)), "releases");
      if (inside(config.dataDir, releaseDir) || inside(config.operatorDir, releaseDir) || inside(releaseDir, config.dataDir)) {
        throw new Error("KIC_RELEASE_DIR must not be in the data directory or the operator channel: a release kept there could be altered. Nothing was released.");
      }
      // The decision log is checked against the operator's own ledger before anything is signed,
      // and the package is assembled from the very record that was checked.
      const { record, head: logHead } = await service.checkedRecord(values.campaign);
      const preview = assembleProgramme(record, { allowPartial: values.partial, clock: systemClock, limits: service.limits, verifier: service.verifier });
      const digest = releaseDigest(preview);
      if (command === "review") {
        const brief = preview.brief;
        console.log(`Programme ${one(preview.programmeId)} (${preview.approvalState}), on ${logHead.sequence} recorded decision(s).`);
        console.log(labelled("Brief for:", brief.client.name));
        console.log(labelled("Evidence policy:", brief.constraints.evidencePolicy));
        console.log("The brief rules out:");
        for (const term of brief.constraints.mustAvoid.length ? brief.constraints.mustAvoid : ["nothing"]) console.log(stored(term));
        for (const reference of brief.references) console.log(labelled(`Reference ${one(reference.id)}:`, `${reference.title}. ${reference.summary}`));
        console.log(labelled(`Narrative ${one(preview.narrative.id)}:`, preview.narrative.title));
        for (const post of preview.posts) {
          const slot = post.slot;
          console.log(`\nPost ${slot.slot} (week ${slot.week}, number ${slot.orderInWeek}): ${post.state}. Purpose: ${slot.intent}.`);
          console.log(labelled("Theme:", slot.theme));
          if (!post.approvedDraft) continue;
          console.log(`Approved draft ${one(post.approvedDraft.id)}:`);
          console.log(stored(post.approvedDraft.body, { multiline: true }));
          if (post.approvedDraft.hashtags.length) console.log(stored(post.approvedDraft.hashtags.join(" ")));
        }
        console.log(`\n${preview.provisionalCommands.length} provisional command(s), all NON-EXECUTABLE.`);
        // Nothing is released that was not put in front of the editor: every value in the
        // package, by its place in it. The digest below covers exactly this.
        console.log("\nEVERYTHING IN THIS PACKAGE (the release digest covers all of it, and nothing else is released):");
        for (const line of everyValue({ ...preview, assembledAt: undefined, release: undefined })) console.log(line);
        console.log(`\nRelease digest: ${digest}`);
        console.log(`\nTo release: release --campaign ${one(record.id)}${values.partial ? " --partial" : ""} --digest ${digest} --id <you> --name "<your name>" --reason "<why>"`);
        return;
      }
      if (digest !== values.digest) {
        throw new Error("The programme is not the one whose digest you gave: its brief, plan, posts or decisions differ. Run `review` again and read it. Nothing was released.");
      }
      const released = releaseProgramme(preview, {
        actor: { kind: "human", id: values.id as string, name: values.name as string },
        rationale: values.reason as string,
        logHead,
        sign: (statement) => service.signRelease(statement),
        clock: systemClock,
      });
      // Released packages are kept on the operator's side, beside the key, unless told otherwise:
      // the campaign data directory can be written by the agent runtime.
      const exported = await exportProgramme(released, releaseDir);
      console.log(`Released ${one(released.programmeId)} (${released.approvalState}): ${released.provisionalCommands.length} approved post(s), on ${logHead.sequence} recorded decision(s).`);
      for (const post of released.posts) console.log(`  post ${post.slot.slot}: ${post.state}${post.approvedDraft ? ` (${one(post.approvedDraft.id)})` : ""}`);
      console.log(`  ${exported.packagePath}`);
      console.log(`  package sha256 ${exported.packageSha256}; signed with key ${released.release?.signature?.keyId ?? "none"}`);
    } else {
      const notices = await operator.pending();
      for (const name of operator.skipped) console.error(`Ignored an unreadable file in the operator channel: ${one(name)}`);
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
          console.log(`${one(described.requestId)}  campaign ${one(described.campaignId)}  ${described.action} ${described.subject.kind} ${one(described.subject.id)}  expires ${one(described.expiresAt)}`);
          console.log(stored(described.content.title));
        }
        if (waiting === 0) console.log("No decisions are waiting.");
      } else if (command === "show") {
        const n = find();
        const d = await service.describeRequest(n.campaignId, n.requestId);
        console.log(`Request ${one(d.requestId)} in campaign ${one(d.campaignId)} — ${d.state}, expires ${one(d.expiresAt)}`);
        console.log(`YOU ARE ASKED TO: ${d.action.toUpperCase()} ${d.subject.kind} ${one(d.subject.id)}`);
        console.log(labelled("Requested by:", d.requestedBy));
        console.log(labelled("Requester's reason (not verified):", d.proposedRationale));
        if (d.revisionInstruction) console.log(labelled("Revision instruction:", d.revisionInstruction));
        console.log(`\n${stored(d.content.title)}\n${"-".repeat(60)}\n${stored(d.content.text, { multiline: true })}`);
        if (d.content.hashtags.length) console.log(`\n${stored(d.content.hashtags.join(" "))}`);
        console.log("-".repeat(60));
        for (const part of d.content.unpublished) console.log(labelled(`${part.label} (recorded, not published):`, part.text));
        for (const part of d.content.basis) {
          console.log(stored(part.label));
          for (const line of part.lines) console.log(stored(line, { lead: "- " }));
        }
        console.log(d.content.evaluation ? labelled("Evaluation:", d.content.evaluation) : "Not evaluated.");
        if (d.content.eligibilityFailures.length) {
          console.log("FAILS MANDATORY CONSTRAINTS:");
          for (const failure of d.content.eligibilityFailures) console.log(stored(failure, { lead: "- " }));
        } else if (d.subject.kind === "draft") {
          console.log("Passes the mandatory constraints checked by code.");
        }
        if (!d.unchanged) console.log("THE CONTENT HAS CHANGED SINCE THIS REQUEST WAS MADE. It cannot be confirmed.");
        // Nothing is signed that was not put in front of the editor: every value the digest covers.
        console.log("\nEVERYTHING THIS DECISION RESTS ON (the request digest covers all of it):");
        for (const line of everyValue(d.covers)) console.log(line);
        console.log(`\nContent sha256: ${d.contentSha256}`);
        console.log(`Request digest: ${d.digest}`);
        console.log(`\nTo confirm: confirm --request ${one(d.requestId)} --action ${d.action} --subject ${one(d.subject.id)} --digest ${d.digest} --id <you> --name "<your name>" --reason "<why>"`);
      } else if (command === "confirm") {
        const n = find();
        if (!values.id || !values.name || !values.reason) throw new Error("confirm needs --id, --name and --reason.");
        if (!values.action || !values.subject || !values.digest) throw new Error("confirm needs --action, --subject and --digest, exactly as `show` displayed them.");
        // The whole digest, not a prefix: a short prefix can be matched by a second, different request.
        if (!/^[0-9a-f]{64}$/.test(values.digest)) throw new Error("--digest must be the whole 64-character request digest that `show` displayed.");
        const d = await service.describeRequest(n.campaignId, n.requestId);
        if (values.action !== d.action || values.subject !== d.subject.id) {
          throw new Error(`Request ${one(d.requestId)} is to ${d.action} ${d.subject.kind} ${one(d.subject.id)}. That is not what you asked to confirm. Nothing was recorded.`);
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
        throw new Error(`Unknown command "${command}". Use init, list, show, confirm, decline, review, release, verify or new-ledger.`);
      }
    }
  }
}

// A refusal is reported in one plain line. Nothing was recorded unless the tool said so.
main().catch((error: unknown) => {
  // One statement, on as many lines as it needs; what follows the first line is behind the margin.
  const pieces = fitToWidth(`Refused: ${displaySafe(error instanceof Error ? error.message : String(error))}`, WIDTH - REST.length);
  console.error(pieces.map((piece, part) => (part === 0 ? "" : REST) + piece).join("\n"));
  process.exitCode = 1;
});
