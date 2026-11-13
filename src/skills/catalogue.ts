import { z } from "zod";
import {
  BriefInterpretation,
  CampaignBrief,
  Evaluation,
  Narrative,
  PostDraft,
  ProgrammePackage,
  ProgrammePlan,
} from "../contracts/index.ts";
import { PROMPT_VERSION } from "./prompts.ts";

export const CATALOGUE_VERSION = "0.1.0";

export interface SkillManifest {
  name: string;
  version: string;
  /** implemented: runs today. deferred: described and fixtured only; no code path. */
  status: "implemented" | "deferred";
  purpose: string;
  /** JSON Schema of the input, or a description when the skill is deferred. */
  inputSchema: unknown;
  outputSchema: unknown;
  /** MCP tools that carry out the skill. */
  requiredTools: string[];
  permissions: {
    /** Outbound network use. "model-gateway" is the only kind any implemented skill has. */
    network: Array<"model-gateway" | "evaluator-mock" | "external-evidence">;
    writes: Array<"campaign-store" | "export-directory">;
    /** True when the skill's result only takes effect after a person confirms it. */
    humanConfirmation: boolean;
  };
  validation: string[];
  failureBehaviour: string;
  promptVersion: string | null;
  fixtures: string[];
}

const js = (schema: z.ZodType) => z.toJSONSchema(schema);
const idInput = z.strictObject({ campaignId: z.string() });

/**
 * The versioned skills catalogue. It is data: portable to another runtime, free of client
 * credentials and of any authority to publish, spend or contact anyone.
 */
export const CATALOGUE: readonly SkillManifest[] = Object.freeze([
  {
    name: "campaign-brief",
    version: "0.1.0",
    status: "implemented",
    purpose: "Accept a client brief, validate it, and produce a reading of its objectives, audience, risks and open questions.",
    inputSchema: js(CampaignBrief),
    outputSchema: js(BriefInterpretation),
    requiredTools: ["kic_create_campaign", "kic_interpret_brief"],
    permissions: { network: ["model-gateway"], writes: ["campaign-store"], humanConfirmation: false },
    validation: [
      "The brief must match kic.campaign-brief/v1 exactly; unknown fields are refused.",
      "Reference ids must be unique.",
      "The cadence must not imply more posts than the slot limit.",
    ],
    failureBehaviour: "An invalid brief is refused with the list of problems and nothing is stored. A failed model call leaves the brief stored without an interpretation.",
    promptVersion: PROMPT_VERSION,
    fixtures: ["fixtures/campaigns/synthetic-harbourline.brief.json"],
  },
  {
    name: "narrative-fanout",
    version: "0.1.0",
    status: "implemented",
    purpose: "Propose alternative campaign narratives that differ in angle, for an editor to choose between.",
    inputSchema: js(z.strictObject({ campaignId: z.string(), count: z.number().int().min(2).max(5) })),
    outputSchema: js(z.array(Narrative)),
    requiredTools: ["kic_generate_narratives", "kic_request_decision", "kic_get_campaign"],
    permissions: { network: ["model-gateway"], writes: ["campaign-store"], humanConfirmation: true },
    validation: [
      "The model must return exactly the number of narratives asked for.",
      "No more than the narrative limit may exist for one campaign.",
      "A narrative is selected or rejected only by a decision the editor records with the operator tool; no agent tool can record one.",
    ],
    failureBehaviour: "A wrong count or malformed output fails the step; nothing is stored.",
    promptVersion: PROMPT_VERSION,
    fixtures: ["fixtures/llm/synthetic-harbourline"],
  },
  {
    name: "programme-plan",
    version: "0.1.0",
    status: "implemented",
    purpose: "Turn the selected narrative into a sequenced programme of posts with themes, intents and calls to action.",
    inputSchema: js(idInput),
    outputSchema: js(ProgrammePlan),
    requiredTools: ["kic_plan_programme"],
    permissions: { network: ["model-gateway"], writes: ["campaign-store"], humanConfirmation: false },
    validation: [
      "Refused until an editor has selected a narrative.",
      "The number of posts must equal the brief's cadence; slot numbers and weeks are assigned by code.",
    ],
    failureBehaviour: "A wrong post count or malformed output fails the step; no plan is stored.",
    promptVersion: PROMPT_VERSION,
    fixtures: ["fixtures/llm/synthetic-harbourline"],
  },
  {
    name: "linkedin-draft",
    version: "0.1.0",
    status: "implemented",
    purpose: "Write alternative LinkedIn drafts for each planned post, and revise a draft when an editor asks.",
    inputSchema: js(
      z.strictObject({ campaignId: z.string(), slots: z.array(z.number().int().min(1)).optional(), variants: z.number().int().min(2).max(4).optional() }),
    ),
    outputSchema: js(z.array(PostDraft)),
    requiredTools: ["kic_generate_drafts", "kic_revise_draft"],
    permissions: { network: ["model-gateway"], writes: ["campaign-store"], humanConfirmation: false },
    validation: [
      "At least two variants per post; no more than the variant limit.",
      "Every figure must be in digits and appear in a claim citing a brief reference that contains it; enforced at evaluation, approval and assembly.",
      "Text is canonicalised; invisible, compatibility and look-alike characters make a draft ineligible.",
      "A revision needs a confirmed revision request from an editor and is limited to a fixed number of passes.",
      "Calls run with bounded concurrency and count against the campaign's model budget.",
    ],
    failureBehaviour: "If any slot's call fails or returns the wrong number of variants, no drafts from that run are stored.",
    promptVersion: PROMPT_VERSION,
    fixtures: ["fixtures/llm/synthetic-harbourline"],
  },
  {
    name: "post-evaluate",
    version: "0.1.0",
    status: "implemented",
    purpose: "Compare the candidate drafts for a post against explicit criteria, with evidence, confidence and stated limits.",
    inputSchema: js(z.strictObject({ campaignId: z.string(), slots: z.array(z.number().int().min(1)).optional() })),
    outputSchema: js(z.array(Evaluation)),
    requiredTools: ["kic_evaluate_drafts", "kic_compare_drafts"],
    permissions: { network: ["evaluator-mock"], writes: ["campaign-store"], humanConfirmation: false },
    validation: [
      "Mandatory constraints are checked by code and rank any ineligible draft below every eligible one.",
      "Only the deterministic mock evaluator is available. Selecting the live JEV evaluator is refused.",
      "State sent to the evaluator is redacted and checked for secret-shaped values before use.",
    ],
    failureBehaviour: "An evaluator error fails the step; no evaluation is stored. Scores are never invented.",
    promptVersion: null,
    fixtures: ["fixtures/llm/synthetic-harbourline"],
  },
  {
    name: "programme-assemble",
    version: "0.1.0",
    status: "implemented",
    purpose: "Assemble approved drafts, decisions and evaluation evidence into an exportable programme package with provisional, non-executable publishing commands.",
    inputSchema: js(z.strictObject({ campaignId: z.string(), allowPartial: z.boolean().optional() })),
    outputSchema: js(ProgrammePackage),
    requiredTools: ["kic_request_decision", "kic_get_campaign", "kic_assemble_programme"],
    permissions: { network: [], writes: ["campaign-store", "export-directory"], humanConfirmation: true },
    validation: [
      "Only drafts with a recorded human approval of their exact text, signed with the operator key, are included as approved.",
      "Approval is refused for a draft that has not been evaluated or that fails a mandatory constraint.",
      "Refused when nothing is approved; refused when slots are pending unless a partial package is asked for.",
      "Every provisional command is non-authoritative and non-executable by schema.",
    ],
    failureBehaviour: "Refuses with the reason. No partial files are left behind by a refusal.",
    promptVersion: null,
    fixtures: ["fixtures/llm/synthetic-harbourline"],
  },
  {
    name: "creator-discover",
    version: "0.0.0",
    status: "deferred",
    purpose: "Retrieve candidate creators for a campaign from an approved discovery source.",
    inputSchema: "Deferred. Needs a verified external source, its licence terms and its schema.",
    outputSchema: "Deferred.",
    requiredTools: [],
    permissions: { network: ["external-evidence"], writes: [], humanConfirmation: true },
    validation: ["Not implemented. No external creator source has been verified."],
    failureBehaviour: "Not available.",
    promptVersion: null,
    fixtures: [],
  },
  {
    name: "creator-evaluate",
    version: "0.0.0",
    status: "deferred",
    purpose: "Assess creators against external evidence with transparent weighted scoring and mandatory eligibility constraints.",
    inputSchema: "Deferred.",
    outputSchema: "Deferred.",
    requiredTools: [],
    permissions: { network: ["external-evidence"], writes: [], humanConfirmation: true },
    validation: ["Not implemented. Observable engagement must not be read as the composition of a creator's audience."],
    failureBehaviour: "Not available.",
    promptVersion: null,
    fixtures: [],
  },
  {
    name: "performance-review",
    version: "0.0.0",
    status: "deferred",
    purpose: "Interpret available campaign evidence after publication.",
    inputSchema: "Deferred. Depends on execution reporting from Kraken.",
    outputSchema: "Deferred.",
    requiredTools: [],
    permissions: { network: [], writes: [], humanConfirmation: false },
    validation: ["Not implemented."],
    failureBehaviour: "Not available.",
    promptVersion: null,
    fixtures: [],
  },
]);
