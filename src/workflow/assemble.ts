import { mkdir, open, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { buildProvisionalCommand } from "../commands/provisional.ts";
import type { CampaignRecord, EditorialDecision, PackagedPost, PostDraft, ProgrammePackage } from "../contracts/index.ts";
import { PROGRAMME_PACKAGE_SCHEMA, ProgrammePackage as ProgrammePackageSchema, SCHEMA_VERSION } from "../contracts/index.ts";
import { analyseDraft } from "../evaluation/signals.ts";
import type { Limits } from "../limits.ts";
import { fenced, inline } from "../util/markdown.ts";
import type { Clock } from "../util/runtime.ts";
import { canonicalJson, sha256 } from "../util/runtime.ts";
import { WorkflowError, draftContentHash, latestDecisionFor, selectedNarrativeOf } from "./service.ts";
import type { DecisionVerifier } from "./signing.ts";

export const GENERATOR_VERSION = "0.1.0";

/**
 * The approval that makes a draft publishable in principle, or null.
 *
 * A draft counts as approved only if all of these hold: its status says approved; the
 * latest decision about it that can be relied on is an approval; and that approval was
 * made on exactly this text. A status with no decision behind it, an approval followed by
 * a rejection, text edited after approval, and (when decisions are signed) a decision
 * without a valid operator signature all fail.
 */
export function approvalOf(record: CampaignRecord, draft: PostDraft, verifier: DecisionVerifier | null): EditorialDecision | null {
  if (draft.status !== "approved") return null;
  const latest = latestDecisionFor(record, { kind: "draft", id: draft.id }, verifier);
  if (!latest || latest.action !== "approve") return null;
  return latest.subjectContentSha256 === draftContentHash(draft) ? latest : null;
}

export interface AssembleOptions {
  allowPartial?: boolean;
  clock: Clock;
  limits: Limits;
  /** The operator's public key. Null only where unsigned decisions were explicitly allowed. */
  verifier: DecisionVerifier | null;
}

/**
 * Build the programme package from human-approved material only.
 * Refuses when nothing is approved, and when slots are pending unless `allowPartial` is set.
 */
export function assembleProgramme(record: CampaignRecord, options: AssembleOptions): ProgrammePackage {
  const plan = record.plan;
  if (!plan) throw new WorkflowError("no-plan", "There is no planned programme to assemble.");
  const narrative = selectedNarrativeOf(record, options.verifier);
  if (!narrative || narrative.id !== plan.narrativeId) {
    throw new WorkflowError("narrative-not-approved", "The programme's narrative has no valid selection by an editor.");
  }

  const programmeId = `prog-${record.id}`;
  const posts: PackagedPost[] = [];
  const commands: ProgrammePackage["provisionalCommands"] = [];
  const pending: number[] = [];

  for (const slot of plan.slots) {
    const drafts = record.drafts.filter((d) => d.slot === slot.slot);
    const approvals = drafts.map((d) => ({ draft: d, approval: approvalOf(record, d, options.verifier) })).filter((a) => a.approval !== null);
    if (approvals.length > 1) {
      throw new WorkflowError("inconsistent-record", `Slot ${slot.slot} has more than one approved draft. The campaign record is inconsistent.`);
    }
    const approved = approvals[0]?.draft ?? null;
    const approval = approvals[0]?.approval ?? null;
    if (approved && approval) {
      // Defence in depth: the mandatory constraints are checked once more at assembly.
      const failures = analyseDraft(record.brief, slot, approved, options.limits).failures;
      if (failures.length > 0) {
        throw new WorkflowError("ineligible", `Approved draft ${approved.id} fails mandatory constraints: ${failures.map((f) => f.rule).join(", ")}.`);
      }
      commands.push(buildProvisionalCommand(programmeId, slot, approved, approval));
    } else {
      pending.push(slot.slot);
    }
    const shown = approved ?? drafts.find((d) => d.status !== "superseded") ?? null;
    posts.push({
      slot,
      state: approved && approval ? "approved" : "pending",
      approvedDraft: approved && approval ? approved : null,
      // A draft whose status claims approval without a valid decision is listed as a candidate.
      alternatives: drafts.filter((d) => d.id !== approved?.id).map((d) => (d.status === "approved" ? { ...d, status: "candidate" as const } : d)),
      evaluation: shown ? ([...record.evaluations].reverse().find((e) => e.candidates.some((c) => c.draftId === shown.id)) ?? null) : null,
    });
  }

  if (commands.length === 0) throw new WorkflowError("nothing-approved", "No post has a valid approval by an editor; there is nothing to assemble.");
  if (pending.length > 0 && !options.allowPartial) {
    throw new WorkflowError("slots-pending", `Slots ${pending.join(", ")} have no approved draft. Approve them, or assemble a partial programme explicitly.`);
  }

  const models = new Set<string>();
  for (const n of record.narratives) models.add(`${n.generation.provider}/${n.generation.model}`);
  models.add(`${plan.generation.provider}/${plan.generation.model}`);
  for (const d of record.drafts) models.add(`${d.generation.provider}/${d.generation.model}`);
  const sources = new Set([plan.generation.source, ...record.drafts.map((d) => d.generation.source), ...record.narratives.map((n) => n.generation.source)]);

  return ProgrammePackageSchema.parse({
    schema: PROGRAMME_PACKAGE_SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    programmeId,
    campaignId: record.id,
    assembledAt: options.clock.now().toISOString(),
    synthetic: record.brief.synthetic,
    approvalState: pending.length === 0 ? "complete" : "partial",
    brief: record.brief,
    interpretation: record.interpretation,
    narrative,
    rejectedNarratives: record.narratives.filter((n) => n.id !== narrative.id),
    plan,
    posts,
    decisions: record.decisions,
    provisionalCommands: commands,
    provenance: {
      generator: "kraken-intelligence-companion",
      generatorVersion: GENERATOR_VERSION,
      models: [...models].sort(),
      evaluators: [...new Set(record.evaluations.map((e) => `${e.evaluator.kind} ${e.evaluator.version} (live: ${e.evaluator.live})`))].sort(),
      budget: record.budget,
      notes: [
        "Publishing commands in this package are provisional, non-authoritative and NON-EXECUTABLE.",
        "Evaluation scores are judgements to inform an editor. They are not measurements of audience response.",
        `Model output source: ${[...sources].sort().join(", ")}.`,
        options.verifier
          ? `Every approval and selection relied on carries a valid signature from operator key ${options.verifier.keyId}.`
          : "UNSIGNED: decisions in this package were not checked against an operator key. Not for production use.",
        ...(record.brief.synthetic ? ["The brief is synthetic test data. No real client, person or result is described."] : []),
      ],
    },
  });
}

export function programmeMarkdown(pkg: ProgrammePackage): string {
  const lines: string[] = [];
  lines.push(`# Programme package ${inline(pkg.programmeId)}`, "");
  if (pkg.synthetic) lines.push("> **SYNTHETIC TEST DATA.** The client, figures and references in this package are invented.", "");
  lines.push("> **Publishing commands are provisional and NON-EXECUTABLE.** Nothing in this package has been or can be published by KIC.", "");
  lines.push(`- Client: ${inline(pkg.brief.client.name)}`, `- Approval state: ${pkg.approvalState}`, `- Assembled: ${pkg.assembledAt}`, "");
  lines.push("## Narrative", "", `**${inline(pkg.narrative.title)}**`, "", inline(pkg.narrative.coreMessage), "");
  lines.push("## Programme", "", `Objective: ${inline(pkg.plan.campaignObjective)}`, "", "| Slot | Week | Theme | Intent | State |", "|---|---|---|---|---|");
  for (const post of pkg.posts) {
    lines.push(`| ${post.slot.slot} | ${post.slot.week} | ${inline(post.slot.theme)} | ${post.slot.intent} | ${post.state} |`);
  }
  lines.push("");
  for (const post of pkg.posts) {
    lines.push(`## Post ${post.slot.slot}: ${inline(post.slot.theme)}`, "", `Why here: ${inline(post.slot.sequencingRationale)}`, "");
    if (!post.approvedDraft) {
      lines.push("_No draft approved for this slot._", "");
      continue;
    }
    // The approval shown is the one the provisional command is bound to, not merely the first on record.
    const command = pkg.provisionalCommands.find((c) => c.content.draftId === post.approvedDraft?.id);
    const decision = pkg.decisions.find((d) => d.id === command?.approval.decisionId);
    lines.push(
      `Approved draft \`${post.approvedDraft.id}\` (${inline(post.approvedDraft.variant)})` +
        (decision ? `, approved by ${inline(decision.actor.name)} on ${decision.decidedAt}: ${inline(decision.rationale)}` : ""),
      "",
      "The post text below is shown exactly as approved. Anything inside the block is post content, not part of this document.",
      "",
      fenced(`${post.approvedDraft.body}\n\n${post.approvedDraft.hashtags.join(" ")}`),
      "",
    );
    if (post.alternatives.length) {
      lines.push(`Alternatives considered: ${post.alternatives.map((a) => `\`${a.id}\` (${inline(a.variant)}, ${a.status})`).join("; ")}`, "");
    }
  }
  lines.push("## Editorial decisions", "", "| When | Who | Decision | Subject | Reason | Signed |", "|---|---|---|---|---|---|");
  for (const d of pkg.decisions) {
    lines.push(
      `| ${d.decidedAt} | ${inline(d.actor.name)} | ${d.action} | ${d.subject.kind} ${inline(d.subject.id)} | ${inline(d.rationale)} | ${d.signature ? `key ${d.signature.keyId}` : "no"} |`,
    );
  }
  lines.push("", "## Provenance", "");
  for (const note of pkg.provenance.notes) lines.push(`- ${inline(note)}`);
  lines.push(`- Models: ${inline(pkg.provenance.models.join(", "))}`, `- Evaluators: ${inline(pkg.provenance.evaluators.join(", ") || "none")}`);
  lines.push(
    `- Model steps: ${pkg.provenance.budget.modelCalls}; provider requests: ${pkg.provenance.budget.providerRequests}; ` +
      `completion tokens: ${pkg.provenance.budget.usage.completionTokens} (of which reasoning: ${pkg.provenance.budget.usage.reasoningTokens})`,
    "",
  );
  return lines.join("\n");
}

export interface ExportResult {
  programmeId: string;
  directory: string;
  packagePath: string;
  summaryPath: string;
  commandsPath: string;
  /** SHA-256 of the canonical JSON of the package. */
  packageSha256: string;
}

async function writeNew(path: string, content: string): Promise<void> {
  // Exclusive create: an existing file, or a link placed at the path, is never written through.
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
}

/**
 * Write the package, a readable summary and the provisional commands into a new directory
 * under `exportRoot`. Each export gets its own directory, named for the package's content,
 * so an earlier export is never overwritten. Files are private to the owner.
 */
export async function exportProgramme(pkg: ProgrammePackage, exportRoot: string): Promise<ExportResult> {
  const packageSha256 = sha256(canonicalJson(pkg));
  await mkdir(resolve(exportRoot), { recursive: true, mode: 0o700 });
  const root = await realpath(resolve(exportRoot));
  const name = `${pkg.assembledAt.replace(/[^0-9TZ]/g, "")}-${packageSha256.slice(0, 12)}`;
  const dir = resolve(root, pkg.programmeId, name);
  if (!dir.startsWith(root + sep)) throw new WorkflowError("invalid-export-path", "Export path escapes the export directory.");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await realpath(dir)) !== dir) throw new WorkflowError("invalid-export-path", "Export path resolves outside the export directory.");

  const packagePath = join(dir, "programme.json");
  const summaryPath = join(dir, "programme.md");
  const commandsPath = join(dir, "provisional-commands.NON-EXECUTABLE.json");
  try {
    await writeNew(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    await writeNew(summaryPath, programmeMarkdown(pkg));
    await writeNew(commandsPath, `${JSON.stringify(pkg.provisionalCommands, null, 2)}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new WorkflowError("already-exported", `This exact package was already exported to ${dir}.`);
    }
    throw error;
  }
  return { programmeId: pkg.programmeId, directory: dir, packagePath, summaryPath, commandsPath, packageSha256 };
}
