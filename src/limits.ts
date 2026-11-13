/** Hard execution bounds. Every loop in the workflow is limited by one of these. */
export interface Limits {
  maxNarratives: number;
  maxSlots: number;
  maxVariantsPerSlot: number;
  maxRevisionPasses: number;
  maxConcurrency: number;
  /** Posts drafted by one drafting step when the caller does not name them. */
  maxSlotsPerDraftStep: number;
  /** Campaigns one instance may hold. */
  maxCampaigns: number;
  /** Model calls allowed over the life of the instance, all campaigns together. */
  maxInstanceModelCalls: number;
  /** Completion tokens (including reasoning) allowed over the life of the instance. */
  maxInstanceCompletionTokens: number;
  /** Model calls allowed over the life of one campaign. */
  maxModelCalls: number;
  /** Completion tokens (including reasoning) allowed over the life of one campaign. */
  maxCompletionTokens: number;
  /** Wall-clock limit for a single model call. */
  modelCallTimeoutMs: number;
  /** Lifetime of a pending editorial decision request. */
  decisionRequestTtlMs: number;
  maxDecisionCodeAttempts: number;
  /** How long a started step may stay unsettled before its whole allowance is charged. */
  reservationTtlMs: number;
  /** Decision requests that may be waiting for a person at one time, per campaign. */
  maxPendingDecisions: number;
  /**
   * Decision requests a campaign holds at one time, whatever became of them. A request that
   * came to nothing is replaced when the same decision is asked for again, so this is not a
   * count over the campaign's life.
   */
  maxDecisionRequests: number;
  /** Previews of one programme kept in the export directory at once. */
  maxPreviewExports: number;
  /** LinkedIn's documented limit for an organic post body. */
  linkedinMaxChars: number;
}

export const DEFAULT_LIMITS: Limits = Object.freeze({
  maxNarratives: 5,
  maxSlots: 24,
  maxVariantsPerSlot: 4,
  maxRevisionPasses: 2,
  maxConcurrency: 3,
  maxSlotsPerDraftStep: 6,
  // Provisional instance ceilings, pending the owner's spend ceiling (OD-6).
  maxCampaigns: 50,
  maxInstanceModelCalls: 2000,
  maxInstanceCompletionTokens: 10_000_000,
  maxModelCalls: 80,
  maxCompletionTokens: 400_000,
  modelCallTimeoutMs: 180_000,
  decisionRequestTtlMs: 30 * 60_000,
  maxDecisionCodeAttempts: 5,
  reservationTtlMs: 30 * 60_000,
  maxPendingDecisions: 25,
  maxDecisionRequests: 1000,
  maxPreviewExports: 50,
  linkedinMaxChars: 3000,
});

export class LimitExceededError extends Error {
  readonly limit: keyof Limits;
  constructor(limit: keyof Limits, message: string) {
    super(message);
    this.name = "LimitExceededError";
    this.limit = limit;
  }
}
