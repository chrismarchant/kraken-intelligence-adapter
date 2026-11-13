import type { Criterion } from "../contracts/index.ts";

/** Default rubric. Level descriptions run worst to best; the weights are relative. */
export const DEFAULT_CRITERIA: readonly Criterion[] = Object.freeze([
  {
    key: "relevance",
    label: "Relevance to the target audience",
    weight: 3,
    levels: [
      "Does not speak to the audience or their problems",
      "Touches the audience's world only in passing",
      "Addresses the audience but not a stated problem",
      "Addresses a stated problem of the audience",
      "Speaks directly to the audience about a stated problem in their terms",
    ],
  },
  {
    key: "grounding",
    label: "Factual grounding",
    weight: 3,
    levels: [
      "Makes checkable claims with no support",
      "Most checkable claims lack support",
      "Some checkable claims are supported",
      "Nearly all checkable claims are supported by a cited reference",
      "Every checkable claim is supported by a cited reference, or none is made",
    ],
  },
  {
    key: "brand_fit",
    label: "Fit with the brand's voice and requirements",
    weight: 2,
    levels: [
      "Contradicts the stated voice",
      "Ignores the stated voice and required points",
      "Partly follows the voice or required points",
      "Follows the voice and most required points",
      "Follows the voice and covers every required point",
    ],
  },
  {
    key: "clarity",
    label: "Clarity",
    weight: 2,
    levels: [
      "Hard to follow",
      "Long sentences and dense paragraphs",
      "Readable with effort",
      "Clear and well paced",
      "Clear, short sentences, easy to scan",
    ],
  },
  {
    key: "hook",
    label: "Opening line",
    weight: 1,
    levels: [
      "No distinct opening line",
      "Opening line is long or generic",
      "Opening line is short but generic",
      "Opening line is short and specific",
      "Opening line is short, specific and addresses the reader",
    ],
  },
  {
    key: "call_to_action",
    label: "Call to action",
    weight: 1,
    levels: [
      "No call to action",
      "Call to action is stated but not in the post",
      "Call to action appears but not at the close",
      "Call to action closes the post",
      "Call to action closes the post and matches the plan for this slot",
    ],
  },
]);

export function normalisedWeights(criteria: readonly Criterion[]): Map<string, number> {
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  return new Map(criteria.map((c) => [c.key, c.weight / total]));
}
