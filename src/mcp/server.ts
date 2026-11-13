import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { CampaignRecord } from "../contracts/index.ts";
import { ModelCallError, ModelOutputError } from "../gateway/gateway.ts";
import { FixtureMissingError } from "../gateway/fixture.ts";
import { JevDisabledError } from "../evaluation/jev.ts";
import { RedactionError } from "../evaluation/redaction.ts";
import { LimitExceededError } from "../limits.ts";
import { CATALOGUE, CATALOGUE_VERSION } from "../skills/catalogue.ts";
import { RecordNotFoundError, StoreBusyError } from "../store/store.ts";
import type { Clock } from "../util/runtime.ts";
import { systemClock } from "../util/runtime.ts";
import { assembleProgramme, exportProgramme } from "../workflow/assemble.ts";
import { comparisonMarkdown } from "../workflow/comparison.ts";
import type { CampaignService } from "../workflow/service.ts";
import { WorkflowError } from "../workflow/service.ts";

export const SERVER_NAME = "kic-campaign-preparation";
export const SERVER_VERSION = "0.1.0";

export const SERVER_INSTRUCTIONS =
  "KIC prepares LinkedIn campaign programmes for a human editor. It cannot publish, schedule, spend or contact anyone, " +
  "and has no tool that does. Narratives and drafts are selected, rejected and approved only by a person: use " +
  "kic_request_decision to ask, then give the person the request id. The person reviews the content and confirms or " +
  "declines with their own operator tool, outside this conversation. There is no tool here that records a decision, " +
  "and you must not try to obtain or relay confirmation codes. Use kic_get_campaign to see whether a decision has been " +
  "made. Evaluation scores are judgements to inform the editor, not measurements. Publishing commands in a programme " +
  "package are provisional and NON-EXECUTABLE.";

export interface KicServerDeps {
  service: CampaignService;
  /** Directory programme packages are exported under. */
  exportRoot: string;
  /** Name recorded as the requester of decisions made through this server. */
  requestedBy?: string;
  clock?: Clock;
}

function ok(structured: Record<string, unknown>, text?: string): CallToolResult {
  return { content: [{ type: "text", text: text ?? JSON.stringify(structured, null, 2) }], structuredContent: structured };
}

/** Turn an error into a tool result. Only messages written for the caller are passed on. */
function failure(error: unknown): CallToolResult {
  let code = "internal-error";
  let message = "The request failed. See the server log.";
  if (error instanceof WorkflowError) [code, message] = [error.code, error.message];
  else if (error instanceof LimitExceededError) [code, message] = [`limit:${error.limit}`, error.message];
  else if (error instanceof RecordNotFoundError) [code, message] = ["not-found", error.message];
  else if (error instanceof StoreBusyError) [code, message] = ["busy", error.message];
  else if (error instanceof JevDisabledError) [code, message] = ["jev-disabled", error.message];
  else if (error instanceof RedactionError) [code, message] = ["redaction", error.message];
  else if (error instanceof ModelOutputError) [code, message] = ["model-output", error.message];
  else if (error instanceof ModelCallError) [code, message] = ["model-call", error.message];
  else if (error instanceof FixtureMissingError) [code, message] = ["fixture-missing", error.message];
  else console.error("[kic-mcp] unexpected error:", error instanceof Error ? `${error.name}: ${error.message}` : "non-error thrown");
  return { isError: true, content: [{ type: "text", text: `${code}: ${message}` }], structuredContent: { error: { code, message } } };
}

async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    return failure(error);
  }
}

/** A compact view of a campaign for an agent: what exists and what state it is in. */
export function campaignSummary(record: CampaignRecord): Record<string, unknown> {
  return {
    campaignId: record.id,
    revision: record.revision,
    client: record.brief.client.name,
    synthetic: record.brief.synthetic,
    interpreted: record.interpretation !== null,
    narratives: record.narratives.map((n) => ({ id: n.id, title: n.title, status: n.status })),
    plan: record.plan
      ? { narrativeId: record.plan.narrativeId, slots: record.plan.slots.map((s) => ({ slot: s.slot, week: s.week, theme: s.theme, intent: s.intent })) }
      : null,
    drafts: record.drafts.map((d) => ({ id: d.id, slot: d.slot, variant: d.variant, status: d.status, revisionOf: d.revisionOf })),
    evaluatedSlots: [...new Set(record.evaluations.map((e) => e.slot))].sort((a, b) => a - b),
    pendingDecisions: record.decisionRequests
      .filter((r) => r.state === "pending")
      .map((r) => ({ requestId: r.id, action: r.action, subject: r.subject, expiresAt: r.expiresAt })),
    decisions: record.decisions.map((d) => ({ id: d.id, action: d.action, subject: d.subject, by: d.actor.name, at: d.decidedAt, signed: d.signature !== null })),
    budget: record.budget,
  };
}

const campaignId = z.string().describe("Campaign id returned by kic_create_campaign.");
const slots = z.array(z.number().int().min(1)).optional().describe("Slot numbers. Omit for every applicable slot.");

/**
 * The KIC MCP server: the typed tools an agent runtime uses to prepare a campaign.
 * There is deliberately no tool that publishes, schedules, sends or spends.
 */
export function createKicServer(deps: KicServerDeps): McpServer {
  const { service } = deps;
  const clock = deps.clock ?? systemClock;
  const requestedBy = deps.requestedBy ?? "mcp-client";
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const callsModel = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

  server.registerTool(
    "kic_list_skills",
    { title: "List KIC skills", description: "The versioned skills catalogue: purpose, schemas, permissions, validation and failure behaviour of each skill.", annotations: readOnly },
    () => guard(async () => ok({ catalogueVersion: CATALOGUE_VERSION, skills: CATALOGUE as unknown as Record<string, unknown>[] })),
  );

  server.registerTool(
    "kic_create_campaign",
    {
      title: "Create a campaign from a brief",
      description: "Validate a client brief (schema kic.campaign-brief/v1) and open a campaign for it. Returns the campaign id.",
      inputSchema: { brief: z.unknown().describe("The brief as a JSON object. See kic_list_skills for the schema.") },
      annotations: writes,
    },
    ({ brief }) => guard(async () => ok(campaignSummary(await service.createCampaign(brief)))),
  );

  server.registerTool(
    "kic_get_campaign",
    { title: "Get campaign state", description: "Current state of a campaign: narratives, plan, drafts, decisions and model budget used.", inputSchema: { campaignId }, annotations: readOnly },
    ({ campaignId: id }) => guard(async () => ok(campaignSummary(await service.getCampaign(id)))),
  );

  server.registerTool(
    "kic_interpret_brief",
    { title: "Interpret the brief", description: "Have the model read the brief and return objectives, audience, key messages, risks and open questions for the editor.", inputSchema: { campaignId }, annotations: callsModel },
    ({ campaignId: id }) => guard(async () => ok({ interpretation: await service.interpretBrief(id) })),
  );

  server.registerTool(
    "kic_generate_narratives",
    {
      title: "Generate narrative alternatives",
      description: "Propose alternative campaign narratives that differ in angle. An editor must then select one through kic_request_decision.",
      inputSchema: { campaignId, count: z.number().int().min(2).max(5).optional().describe("How many alternatives. Default 3.") },
      annotations: callsModel,
    },
    ({ campaignId: id, count }) => guard(async () => ok({ narratives: await service.generateNarratives(id, count ?? 3) })),
  );

  server.registerTool(
    "kic_plan_programme",
    { title: "Plan the programme", description: "Plan the sequenced programme of posts on the narrative the editor selected. Refused until a narrative is selected.", inputSchema: { campaignId }, annotations: callsModel },
    ({ campaignId: id }) => guard(async () => ok({ plan: await service.planProgramme(id) })),
  );

  server.registerTool(
    "kic_generate_drafts",
    {
      title: "Write draft alternatives",
      description: "Write alternative LinkedIn drafts for planned posts. At least two variants per post.",
      inputSchema: { campaignId, slots, variants: z.number().int().min(2).max(4).optional().describe("Alternatives per post. Default 2.") },
      annotations: callsModel,
    },
    ({ campaignId: id, slots: s, variants }) => guard(async () => ok({ drafts: await service.generateDrafts(id, { slots: s, variants }) })),
  );

  server.registerTool(
    "kic_evaluate_drafts",
    {
      title: "Evaluate drafts",
      description: "Compare the candidate drafts of each post against explicit criteria. Returns scores, evidence, confidence, eligibility and limitations.",
      inputSchema: { campaignId, slots },
      annotations: writes,
    },
    ({ campaignId: id, slots: s }) => guard(async () => ok({ evaluations: await service.evaluateDrafts(id, { slots: s }) })),
  );

  server.registerTool(
    "kic_compare_drafts",
    { title: "Show the comparison", description: "A readable side-by-side comparison of the drafts for each post, for the editor.", inputSchema: { campaignId, slots }, annotations: readOnly },
    ({ campaignId: id, slots: s }) =>
      guard(async () => {
        const markdown = comparisonMarkdown(await service.getCampaign(id), s);
        return ok({ markdown }, markdown);
      }),
  );

  server.registerTool(
    "kic_request_decision",
    {
      title: "Ask the editor for a decision",
      description:
        "Ask a person to select or reject a narrative, or to select, approve, reject or request a revision of a draft. " +
        "Nothing changes until the person confirms with their own operator tool. This server cannot record a decision.",
      inputSchema: {
        campaignId,
        subjectKind: z.enum(["narrative", "draft"]),
        subjectId: z.string(),
        action: z.enum(["select", "approve", "reject", "request-revision"]),
        proposedRationale: z.string().describe("Why you propose this, in one or two sentences."),
        revisionInstruction: z.string().optional().describe("For request-revision: what should change."),
      },
      annotations: writes,
    },
    (input) =>
      guard(async () =>
        ok({
          ...(await service.requestDecision({
            campaignId: input.campaignId,
            subject: { kind: input.subjectKind, id: input.subjectId },
            action: input.action,
            proposedRationale: input.proposedRationale,
            revisionInstruction: input.revisionInstruction ?? null,
            requestedBy,
          })),
          next: "Give the editor the request id. They review the content and confirm or decline with their operator tool. Check kic_get_campaign for the outcome.",
        }),
      ),
  );

  server.registerTool(
    "kic_revise_draft",
    {
      title: "Revise a draft",
      description: "Revise a draft on the instruction an editor confirmed with request-revision. Limited to a fixed number of passes. Re-evaluate the slot afterwards.",
      inputSchema: { campaignId, draftId: z.string() },
      annotations: callsModel,
    },
    ({ campaignId: id, draftId }) => guard(async () => ok({ draft: await service.reviseDraft(id, draftId) })),
  );

  server.registerTool(
    "kic_assemble_programme",
    {
      title: "Assemble and export the programme package",
      description:
        "Build the programme package from human-approved drafts only and export it. Publishing commands in the package " +
        "are provisional and NON-EXECUTABLE. Refused when nothing is approved, or when posts are pending unless allowPartial is true.",
      inputSchema: { campaignId, allowPartial: z.boolean().optional() },
      annotations: writes,
    },
    ({ campaignId: id, allowPartial }) =>
      guard(async () => {
        const pkg = assembleProgramme(await service.getCampaign(id), { allowPartial: allowPartial ?? false, clock, limits: service.limits, verifier: service.verifier });
        const exported = await exportProgramme(pkg, deps.exportRoot);
        return ok({
          programmeId: pkg.programmeId,
          approvalState: pkg.approvalState,
          approvedPosts: pkg.posts.filter((p) => p.state === "approved").map((p) => p.slot.slot),
          pendingPosts: pkg.posts.filter((p) => p.state === "pending").map((p) => p.slot.slot),
          provisionalCommands: pkg.provisionalCommands.map((c) => ({ commandId: c.commandId, status: c.status, executable: c.executable, authoritative: c.authoritative })),
          export: exported,
        });
      }),
  );

  return server;
}
