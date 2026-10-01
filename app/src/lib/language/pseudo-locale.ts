export const PSEUDO_LOCALE = "en-XA";

const PLACEHOLDER = /(\{[^}]*\})/;
const LENGTHENING = 0.4;
const PADDING = "·";
const ACCENTED: Readonly<Record<string, string>> = {
  a: "á",
  b: "ƀ",
  c: "ç",
  d: "ð",
  e: "é",
  f: "ƒ",
  g: "ĝ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ķ",
  l: "ļ",
  m: "ɱ",
  n: "ñ",
  o: "ö",
  p: "þ",
  q: "ǫ",
  r: "ŕ",
  s: "š",
  t: "ţ",
  u: "û",
  v: "ṽ",
  w: "ŵ",
  x: "ẋ",
  y: "ý",
  z: "ž",
  A: "Á",
  B: "Ɓ",
  C: "Ç",
  D: "Ð",
  E: "É",
  F: "Ƒ",
  G: "Ĝ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ķ",
  L: "Ļ",
  M: "Ṁ",
  N: "Ñ",
  O: "Ö",
  P: "Þ",
  Q: "Ǫ",
  R: "Ŕ",
  S: "Š",
  T: "Ţ",
  U: "Û",
  V: "Ṽ",
  W: "Ŵ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ž",
};

export type Message =
  | string
  | readonly {
      readonly declarations?: readonly string[];
      readonly selectors?: readonly string[];
      readonly match: Readonly<Record<string, string>>;
    }[];

/** Accents the text outside placeholders, pads it by 40% and marks both ends, so untranslated or clipped text stands out. */
export function pseudoText(text: string): string {
  const accented = text
    .split(PLACEHOLDER)
    .map((part) =>
      PLACEHOLDER.test(part)
        ? part
        : Array.from(
            part,
            (character) => ACCENTED[character] ?? character,
          ).join(""),
    )
    .join("");
  const padding = PADDING.repeat(Math.ceil(text.length * LENGTHENING));
  return `⟦${accented}${padding}⟧`;
}

export function pseudoMessages(
  messages: Readonly<Record<string, Message>>,
): Record<string, Message> {
  return Object.fromEntries(
    Object.entries(messages).map(([key, message]) => [
      key,
      typeof message === "string"
        ? pseudoText(message)
        : message.map((variant) => ({
            ...variant,
            match: Object.fromEntries(
              Object.entries(variant.match).map(([selector, text]) => [
                selector,
                pseudoText(text),
              ]),
            ),
          })),
    ]),
  );
}
