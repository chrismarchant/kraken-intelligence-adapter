/**
 * Model-written and person-written text is placed into editor-facing documents. These
 * helpers make sure such text is shown as text and cannot pose as part of the document.
 */

/** Text for use inside a sentence, heading or table cell: one line, markdown characters escaped. */
export function inline(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\`*_{}[\]()#+!|<>~]/g, (c) => `\\${c}`);
}

/** A fenced block that the content cannot close: the fence is longer than any run of backticks inside. */
export function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}
