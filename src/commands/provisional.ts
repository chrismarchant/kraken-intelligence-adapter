import type { EditorialDecision, PostDraft, ProgrammeSlot, ProvisionalPublishCommand } from "../contracts/index.ts";
import { NON_EXECUTABLE_NOTICE, PROVISIONAL_COMMAND_SCHEMA, ProvisionalPublishCommand as Schema } from "../contracts/index.ts";
import { sha256 } from "../util/runtime.ts";

/**
 * Describe an approved post in a provisional shape for later translation to Kraken's
 * accepted contract. This function does not publish, schedule or send anything, and
 * nothing in KIC can: there is no publishing client in this codebase.
 */
export function buildProvisionalCommand(
  programmeId: string,
  slot: ProgrammeSlot,
  draft: PostDraft,
  approval: EditorialDecision,
  signatureVerified: boolean,
): ProvisionalPublishCommand {
  if (draft.status !== "approved") {
    throw new Error(`Draft ${draft.id} is not approved; no provisional command can be built for it.`);
  }
  if (approval.action !== "approve" || approval.subject.id !== draft.id) {
    throw new Error(`Decision ${approval.id} is not an approval of draft ${draft.id}.`);
  }
  return Schema.parse({
    schema: PROVISIONAL_COMMAND_SCHEMA,
    status: "NON-EXECUTABLE",
    authoritative: false,
    executable: false,
    notice: NON_EXECUTABLE_NOTICE,
    commandId: `cmd-${programmeId}-${String(slot.slot).padStart(2, "0")}`,
    programmeId,
    channel: "linkedin",
    kind: "organic-post",
    sequence: { slot: slot.slot, week: slot.week, orderInWeek: slot.orderInWeek },
    content: {
      draftId: draft.id,
      body: draft.body,
      hashtags: draft.hashtags,
      bodySha256: sha256(draft.body),
    },
    approval: { decisionId: approval.id, approvedBy: approval.actor, approvedAt: approval.decidedAt, signatureVerified },
    translation: {
      target: "kraken",
      contract: null,
      note: "No Kraken contract is accepted for KIC. Kraken's authoritative contract will govern any future translation.",
    },
  });
}
