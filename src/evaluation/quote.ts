import { allowedInDraft, named } from "./characters.ts";

/**
 * Quote a text the way a finding may show it: cut to a stated length of whole characters, and
 * with every character a draft may not contain named by its code point instead of reproduced,
 * so that the finding cannot itself carry what it reports.
 */
export function quoted(text: string, max: number): string {
  const characters = [...text];
  const kept = characters.slice(0, max);
  let shown = "";
  let previous: string | undefined;
  for (const character of kept) {
    if (character !== "\n" && character !== "\t" && character !== "\r" && allowedInDraft(character, previous)) {
      shown += character;
    } else {
      shown += `<${named(character)}>`;
    }
    previous = character;
  }
  const cut = characters.length > max ? ` (first ${max} of ${characters.length} characters)` : "";
  return `"${shown}"${cut}`;
}
