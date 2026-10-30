import { TRIGRAM_CHARS } from "./closest-words.ts";

function isShorterThanATrigram(text: string): boolean {
  return Array.from(text).length < TRIGRAM_CHARS;
}

export function phrasesOf(text: string): readonly string[] | null {
  const words = text.split(/\s+/u).filter((word) => word !== "");
  if (isShorterThanATrigram(words.join(" "))) {
    return null;
  }
  const phrases: string[][] = [];
  for (const word of words) {
    const last = phrases.at(-1);
    if (
      last !== undefined &&
      (isShorterThanATrigram(word) || isShorterThanATrigram(last.join(" ")))
    ) {
      last.push(word);
    } else {
      phrases.push([word]);
    }
  }
  return phrases.map((phrase) => phrase.join(" "));
}
