import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { buildProvisionalCommand } from "../commands/provisional.ts";
import type { CampaignRecord, EditorialDecision, PackagedPost, PostDraft, ProgrammePackage } from "../contracts/index.ts";
import { PROGRAMME_PACKAGE_SCHEMA, ProgrammePackage as ProgrammePackageSchema, SCHEMA_VERSION } from "../contracts/index.ts";
import { analyseDraft } from "../evaluation/signals.ts";
import type { Limits } from "../limits.ts";
import type { Clock } from "../util/runtime.ts";
import { canonicalJson, sha256 } from "../util/runtime.ts";
import { WorkflowError, draftContentHash } from "./service.ts";

export const GENERATOR_VERSION = "0.1.0";

/**
 * The approval that makes a draft publishable in principle: a person's recorded approval of
 * exactly this text. A draft whose status says "approved" but which has no matching decision
 * is not treated as approved.
 */
export function approvalOf(record: CampaignRecord, draft: PostDraft): EditorialDecision | null {
  if (draft.status !== "approved") return null;
  const hash = draftContentHash(draft);
  return (
    [...record.decisions]
      .reverse()
      .find((d) => d.action === "approve" && d.subject.kind === "draft" && d.subject.id === draft.id && d.subjectContentSha256 === hash) ?? null
  );
}

/**
 * Build the programme package from human-approved material only.
 * Refuses when nothing is approved, and when slots are pending unless `allowPartial` is set.
 */
export function assembleProgramme(
  record: CampaignRecord,
  options: { allowPartial?: boolean; clock: Clock; limits: Limits },
): ProgrammePackage {
  const plan = record.plan;
  const narrative = record.narratives.find((n) => n.id === plan?.narrativeId);
  if (!plan || !narrative) throw new WorkflowError("no-plan", "There is no planned programme to assemble.");
  const narrativeDecision = record.decisions.find((d) => d.subject.kind === "narrative" && d.subject.id === narrative.id && d.action === "select");
  if (narrative.status !== "selected" || !narrativeDecision) {
    throw new WorkflowError("narrative-not-approved", "The programme's narrative has no recorded selection by an editor.");
  }

  const programmeId = `prog-${record.id}`;
  const posts: PackagedPost[] = [];
  const commands: ProgrammePackage["provisionalCommands"] = [];
  const pending: number[] = [];

  for (const slot of plan.slots) {
    const drafts = record.drafts.filter((d) => d.slot === slot.slot);
    const approved = drafts.find((d) => approvalOf(record, d) !== null) ?? null;
    const approval = approved ? approvalOf(record, approved) : null;
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
      alternatives: drafts.filter((d) => d.id !== approved?.id),
      evaluation: shown ? ([...record.evaluations].reverse().find((e) => e.candidates.some((c) => c.draftId === shown.id)) ?? null) : null,
    });
  }

  if (commands.length === 0) throw new WorkflowError("nothing-approved", "No post has been approved by an editor; there is nothing to assemble.");
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
        ...(record.brief.synthetic ? ["The brief is synthetic test data. No real client, person or result is described."] : []),
      ],
    },
  });
}

export function programmeMarkdown(pkg: ProgrammePackage): string {
  const lines: string[] = [];
  lines.push(`# Programme package ${pkg.programmeId}`, "");
  if (pkg.synthetic) lines.push("> **SYNTHETIC TEST DATA.** The client, figures and references in this package are invented.", "");
  lines.push("> **Publishing commands are provisional and NON-EXECUTABLE.** Nothing in this package has been or can be published by KIC.", "");
  lines.push(`- Client: ${pkg.brief.client.name}`, `- Approval state: ${pkg.approvalState}`, `- Assembled: ${pkg.assembledAt}`, "");
  lines.push("## Narrative", "", `**${pkg.narrative.title}**`, "", pkg.narrative.coreMessage, "");
  lines.push("## Programme", "", `Objective: ${pkg.plan.campaignObjective}`, "", "| Slot | Week | Theme | Intent | State |", "|---|---|---|---|---|");
  for (const post of pkg.posts) {
    lines.push(`| ${post.slot.slot} | ${post.slot.week} | ${post.slot.theme.replace(/\|/g, "/")} | ${post.slot.intent} | ${post.state} |`);
  }
  lines.push("");
  for (const post of pkg.posts) {
    lines.push(`## Post ${post.slot.slot}: ${post.slot.theme}`, "", `Why here: ${post.slot.sequencingRationale}`, "");
    if (!post.approvedDraft) {
      lines.push("_No draft approved for this slot._", "");
      continue;
    }
    const decision = pkg.decisions.find((d) => d.action === "approve" && d.subject.id === post.approvedDraft?.id);
    lines.push(
      `Approved draft \`${post.approvedDraft.id}\` (${post.approvedDraft.variant})` +
        (decision ? `, approved by ${decision.actor.name} on ${decision.decidedAt}: "${decision.rationale}"` : ""),
      "",
      "```text",
      post.approvedDraft.body,
      "",
      post.approvedDraft.hashtags.join(" "),
      "```",
      "",
    );
    if (post.alternatives.length) {
      lines.push(`Alternatives considered: ${post.alternatives.map((a) => `\`${a.id}\` (${a.variant}, ${a.status})`).join("; ")}`, "");
    }
  }
  lines.push("## Editorial decisions", "", "| When | Who | Decision | Subject | Reason |", "|---|---|---|---|---|");
  for (const d of pkg.decisions) {
    lines.push(`| ${d.decidedAt} | ${d.actor.name} | ${d.action} | ${d.subject.kind} ${d.subject.id} | ${d.rationale.replace(/\|/g, "/")} |`);
  }
  lines.push("", "## Provenance", "");
  for (const note of pkg.provenance.notes) lines.push(`- ${note}`);
  lines.push(`- Models: ${pkg.provenance.models.join(", ")}`, `- Evaluators: ${pkg.provenance.evaluators.join(", ") || "none"}`);
  lines.push(
    `- Model calls: ${pkg.provenance.budget.modelCalls}; completion tokens: ${pkg.provenance.budget.usage.completionTokens} ` +
      `(of which reasoning: ${pkg.provenance.budget.usage.reasoningTokens})`,
    "",
  );
  return lines.join("\n");
}

export interface ExportResult {
  programmeId: string;
  packagePath: string;
  summaryPath: string;
  commandsPath: string;
  /** SHA-256 of the canonical JSON of the package. */
  packageSha256: string;
}

/** Write the package, a readable summary and the provisional commands under `exportRoot`. */
export async function exportProgramme(pkg: ProgrammePackage, exportRoot: string): Promise<ExportResult> {
  const root = resolve(exportRoot);
  const dir = resolve(root, pkg.programmeId);
  if (dir !== root && !dir.startsWith(root + sep)) throw new WorkflowError("invalid-export-path", "Export path escapes the export directory.");
  await mkdir(dir, { recursive: true });
  const packagePath = join(dir, "programme.json");
  const summaryPath = join(dir, "programme.md");
  const commandsPath = join(dir, "provisional-commands.NON-EXECUTABLE.json");
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  await writeFile(summaryPath, programmeMarkdown(pkg));
  await writeFile(commandsPath, `${JSON.stringify(pkg.provisionalCommands, null, 2)}\n`);
  return { programmeId: pkg.programmeId, packagePath, summaryPath, commandsPath, packageSha256: sha256(canonicalJson(pkg)) };
}
