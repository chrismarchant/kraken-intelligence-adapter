import type { CampaignRecord, Evaluation, PostDraft } from "../contracts/index.ts";

export interface SlotComparison {
  slot: number;
  theme: string;
  evaluation: Evaluation | null;
  drafts: PostDraft[];
}

/** The latest evaluation and the live drafts for each slot. */
export function compareSlots(record: CampaignRecord, slots?: number[]): SlotComparison[] {
  const plan = record.plan;
  if (!plan) return [];
  return plan.slots
    .filter((s) => !slots || slots.includes(s.slot))
    .map((s) => ({
      slot: s.slot,
      theme: s.theme,
      evaluation: [...record.evaluations].reverse().find((e) => e.slot === s.slot) ?? null,
      drafts: record.drafts.filter((d) => d.slot === s.slot && d.status !== "superseded"),
    }));
}

const pct = (n: number) => `${Math.round(n * 100)}`;
const cell = (text: string) => text.replace(/\|/g, "/").replace(/\n/g, " ");

/** A comparison an editor can read: scores side by side, the evidence under them, and the limits. */
export function comparisonMarkdown(record: CampaignRecord, slots?: number[]): string {
  const lines: string[] = [];
  for (const item of compareSlots(record, slots)) {
    lines.push(`## Post ${item.slot}: ${item.theme}`, "");
    if (item.drafts.length === 0) {
      lines.push("_No drafts yet._", "");
      continue;
    }
    const evaluation = item.evaluation;
    if (!evaluation) {
      lines.push("_Not evaluated yet._", "");
      for (const d of item.drafts) lines.push(`- \`${d.id}\` ${d.variant} (${d.status})`);
      lines.push("");
      continue;
    }
    const order = [...evaluation.ranking, ...item.drafts.map((d) => d.id).filter((id) => !evaluation.ranking.includes(id))];
    const header = ["Rank", "Draft", "Variant", "Status", "Eligible", "Total", ...evaluation.criteria.map((c) => c.label)];
    lines.push(`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`);
    order.forEach((id, index) => {
      const draft = item.drafts.find((d) => d.id === id);
      const candidate = evaluation.candidates.find((c) => c.draftId === id);
      if (!draft) return;
      if (!candidate) {
        lines.push(`| – | \`${id}\` | ${cell(draft.variant)} | ${draft.status} | not evaluated | – | ${evaluation.criteria.map(() => "–").join(" | ")} |`);
        return;
      }
      const scores = evaluation.criteria.map((c) => pct(candidate.scores.find((s) => s.criterion === c.key)?.score ?? 0));
      lines.push(
        `| ${index + 1} | \`${id}\`${evaluation.preferred === id ? " ★" : ""} | ${cell(draft.variant)} | ${draft.status} | ` +
          `${candidate.eligibility.eligible ? "yes" : "**NO**"} | ${pct(candidate.weightedTotal)} | ${scores.join(" | ")} |`,
      );
    });
    lines.push("", "Scores are 0–100. ★ marks the evaluator's preferred draft.", "");
    for (const id of order) {
      const draft = item.drafts.find((d) => d.id === id);
      const candidate = evaluation.candidates.find((c) => c.draftId === id);
      if (!draft || !candidate) continue;
      lines.push(`### \`${id}\` — ${draft.variant}`, "", `Approach: ${draft.approach}`, "");
      if (!candidate.eligibility.eligible) {
        lines.push("**Cannot be approved:**");
        for (const f of candidate.eligibility.failures) lines.push(`- ${f.rule}: ${f.detail}`);
        lines.push("");
      }
      lines.push("Evidence:");
      for (const s of candidate.signals) {
        lines.push(`- ${s.criterion}: ${s.observation}${s.evidence.length ? ` — ${s.evidence.slice(0, 4).join("; ")}` : ""}`);
      }
      lines.push("", "```text", draft.body, "", draft.hashtags.join(" "), "```", "");
    }
    lines.push(`Evaluator: ${evaluation.evaluator.kind} ${evaluation.evaluator.version} (live: ${evaluation.evaluator.live}).`, "", "Limits of this comparison:");
    for (const l of evaluation.limitations) lines.push(`- ${l}`);
    lines.push("");
  }
  return lines.join("\n");
}
