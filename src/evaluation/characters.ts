/**
 * The characters a draft may contain.
 *
 * A ruled-out word can be written so that a reader sees it and a rule does not: with a letter
 * from another alphabet, with a symbol that is drawn as a letter, with an emoji of a letter in
 * a square, a flag made of two letters, a small letter printed above another one. Several
 * reviews each found a kind that the lists of look-alikes then in use had missed, and no such
 * list is ever complete. So the rule is turned round: this file says what a draft MAY contain,
 * character by character, and everything else is refused. Nothing is allowed by category:
 * every emoji and every symbol here is named. What is allowed is small enough to go through
 * one character at a time, and for each character that can stand in for a letter, signals.ts
 * reads it as that letter too.
 *
 * The cost is stated in the threat model. A draft cannot quote a word in another script,
 * cannot use a symbol or an emoji that is not listed here (no flags, no skin tones, no
 * emoji joined into one), and must set an emoji or a picture symbol apart from words.
 */

/**
 * Letters: the Latin alphabet as European languages write it, with Vietnamese and pinyin.
 * Not the phonetic, small-capital, historic or mathematical Latin letters.
 */
const LETTER =
  /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u01A0\u01A1\u01AF\u01B0\u01CD-\u01DC\u0218-\u021B\u1E00-\u1E99\u1E9E\u1EA0-\u1EF9]/u;

/** Every mark on an ordinary keyboard. */
const KEYBOARD_MARK = /[!-/:-@[-`{-~]/;

/**
 * Typographic marks that are written against words and figures: quotation marks, dashes,
 * a bullet, currency signs and the signs of arithmetic. Those that can stand in for a letter
 * are read as that letter in signals.ts (SYMBOL_READING there must cover this list).
 */
const TYPOGRAPHIC = new Set(
  [
    0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2013, 0x2014, 0x2022, 0x00b7, 0x00ab, 0x00bb, 0x2039, 0x203a, 0x00a1, 0x00bf, 0x00a7, 0x00b6,
    0x2020, 0x2021, 0x00a9, 0x00ae, 0x00b0, 0x00b1, 0x00d7, 0x00f7, 0x20ac, 0x00a3, 0x00a5, 0x00a2, 0x2212, 0x2032, 0x2030, 0x2248, 0x2260, 0x2264,
    0x2265, 0x221e,
  ].map((code) => String.fromCodePoint(code)),
);

/**
 * Pictures: arrows, ticks, stars and shapes, and a fixed list of emoji. Each is a picture of a
 * thing, a face or a gesture. None is a picture of a letter, a word or a figure, and none is
 * a flag. A picture must stand apart from words: see characterProblems.
 */
const PICTURE = new Set(
  [
    // Arrows, ticks, stars and shapes.
    0x2190, 0x2192, 0x2191, 0x2193, 0x2194, 0x21d2, 0x2713, 0x2714, 0x2717, 0x2718, 0x2605, 0x2606, 0x25aa, 0x25a0, 0x25a1, 0x25b6, 0x25ba, 0x25c6,
    0x25cf, 0x27a1, 0x2b07, 0x2b06,
    // Emoji.
    0x1f680, 0x2705, 0x1f449, 0x1f447, 0x1f446, 0x1f448, 0x1f4a1, 0x1f4c8, 0x1f4c9, 0x1f4ca, 0x1f3af, 0x1f525, 0x1f44f, 0x1f64c, 0x2728, 0x1f91d,
    0x1f4ac, 0x1f4cc, 0x23f0, 0x1f4c5, 0x1f517, 0x2b50, 0x1f31f, 0x1f4aa, 0x1f64f, 0x1f44d, 0x1f440, 0x1f389, 0x1f3c6, 0x1f4e3, 0x1f4e2, 0x1f50d,
    0x1f511, 0x1f9e0, 0x26a1, 0x1f4dd, 0x1f4da, 0x1f914, 0x1f600, 0x1f60a, 0x1f642, 0x1f609, 0x1f393, 0x1f4bc, 0x1f30d, 0x1f331, 0x23f3, 0x1f6e0,
    0x2699, 0x1f4e6, 0x1f9e9, 0x1f514, 0x2764, 0x1f499, 0x1f49a, 0x1f9ed, 0x1f4cd, 0x1f916, 0x1f6a8, 0x26a0, 0x1f512, 0x1f9ea, 0x1f4f1, 0x1f4bb,
    0x2615, 0x1f3c1, 0x1f947, 0x1f44b, 0x1f4b0, 0x1f4b8, 0x1f4de, 0x1f4e7, 0x2709, 0x1f4c4, 0x1f4c1, 0x1f465, 0x1f464, 0x1f3e2, 0x1f3ed, 0x1f69a,
    0x2708, 0x1f33f, 0x1f4a5, 0x1f44c, 0x1f91e, 0x1f64b, 0x1f381,
  ].map((code) => String.fromCodePoint(code)),
);

/** Asks for the emoji drawing of the picture before it. Allowed there and nowhere else. */
const VARIATION = "\uFE0F";

export const isAllowedLetter = (character: string): boolean => LETTER.test(character);
export const isPicture = (character: string): boolean => PICTURE.has(character);

export interface CharacterProblems {
  /** Characters a draft may not contain, each once, in order of first appearance. */
  outside: string[];
  /** Pictures written in the same word as a letter or a digit. */
  attachedPictures: number;
}

/**
 * Go through a text one character at a time and report what it may not contain. The text is
 * expected to be in canonical form already (see canonicalText): what compatibility folding
 * would change is refused before this is asked.
 */
export function characterProblems(text: string): CharacterProblems {
  const outside = new Set<string>();
  let attachedPictures = 0;
  // A word here is whatever stands between two blanks. A picture in the same word as a letter
  // or a digit can stand in for a letter of it, with or without a mark between them
  // ("b-O-x" with a circle for the O). A picture with only marks beside it is fine ("done!").
  for (const word of text.split(/[ \n\t]+/)) {
    const characters = [...word];
    let pictures = 0;
    let lettersOrDigits = 0;
    for (let i = 0; i < characters.length; i++) {
      const c = characters[i] as string;
      if (LETTER.test(c) || /[0-9]/.test(c)) lettersOrDigits += 1;
      else if (PICTURE.has(c)) pictures += 1;
      else if (c === VARIATION && i > 0 && PICTURE.has(characters[i - 1] as string)) continue;
      else if (!KEYBOARD_MARK.test(c) && !TYPOGRAPHIC.has(c)) outside.add(c);
    }
    if (pictures > 0 && lettersOrDigits > 0) attachedPictures += pictures;
  }
  return { outside: [...outside], attachedPictures };
}

/** A character named so that it cannot itself mislead: "U+1F170". */
export const named = (character: string): string => `U+${(character.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`;
