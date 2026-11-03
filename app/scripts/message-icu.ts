export type MessageVariant = {
  readonly declarations?: readonly string[];
  readonly selectors?: readonly string[];
  readonly match: Readonly<Record<string, string>>;
};

export type Message = string | readonly [MessageVariant];

export type Messages = Readonly<Record<string, Message>>;

type Part =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "argument"; readonly name: string; readonly type: string }
  | {
      readonly kind: "plural";
      readonly name: string;
      readonly branches: readonly {
        readonly category: string;
        readonly parts: readonly Part[];
      }[];
    };

interface Alias {
  readonly input: string;
  readonly fn: string;
}

const DECLARATION = /^local (\w+) = (\w+): (\w+)$/u;
const ROW_KEY = /^(\w+)=(\S+)$/u;
const WILDCARD = "*";

function aliasesOf(declarations: readonly string[]): Map<string, Alias> {
  const aliases = new Map<string, Alias>();
  for (const declaration of declarations) {
    const found = DECLARATION.exec(declaration);
    if (found?.[1] !== undefined && found[2] !== undefined) {
      aliases.set(found[1], { input: found[2], fn: found[3] ?? "" });
    }
  }
  return aliases;
}

type Tree = string | Map<string, Tree>;

function rowsToTree(
  selectors: readonly string[],
  match: Readonly<Record<string, string>>,
): Tree {
  if (selectors.length === 0) {
    const only = match[WILDCARD];
    if (only === undefined) {
      throw new Error("a message without selectors needs a * row");
    }
    return only;
  }
  const root = new Map<string, Tree>();
  for (const [key, text] of Object.entries(match)) {
    const categories = key.split(", ").map((part) => {
      if (part === WILDCARD) {
        return WILDCARD;
      }
      const found = ROW_KEY.exec(part);
      if (found?.[2] === undefined) {
        throw new Error(`cannot read the variant key ${key}`);
      }
      return found[2];
    });
    const wildcardAt = categories.indexOf(WILDCARD);
    const path =
      wildcardAt === -1 ? categories : categories.slice(0, wildcardAt);
    let node = root;
    path.forEach((category, depth) => {
      if (depth === path.length - 1) {
        if (node.has(category)) {
          throw new Error(`the variant ${key} repeats another row`);
        }
        node.set(category, text);
        return;
      }
      const next = node.get(category) ?? new Map<string, Tree>();
      if (typeof next === "string") {
        throw new Error(`the variant ${key} sits under a wildcard row`);
      }
      node.set(category, next);
      node = next;
    });
  }
  return root;
}

function numberAsIcu(
  text: string,
  aliases: ReadonlyMap<string, Alias>,
): string {
  return text.replaceAll(/\{(\w+)\}/gu, (whole, name: string) => {
    const alias = aliases.get(name);
    return alias?.fn === "number" ? `{${alias.input}, number}` : whole;
  });
}

function treeToIcu(
  tree: Tree,
  selectors: readonly string[],
  depth: number,
  aliases: ReadonlyMap<string, Alias>,
): string {
  if (typeof tree === "string") {
    return numberAsIcu(tree, aliases);
  }
  const selector = selectors[depth];
  const input =
    selector === undefined ? undefined : aliases.get(selector)?.input;
  if (input === undefined) {
    throw new Error(`no input behind the selector ${String(selector)}`);
  }
  const branches = [...tree].map(
    ([category, sub]) =>
      `${category} {${treeToIcu(sub, selectors, depth + 1, aliases)}}`,
  );
  return `{${input}, plural, ${branches.join(" ")}}`;
}

export function toIcu(message: Message): string {
  if (typeof message === "string") {
    return message;
  }
  const [variant] = message;
  const aliases = aliasesOf(variant.declarations ?? []);
  const selectors = variant.selectors ?? [];
  return treeToIcu(rowsToTree(selectors, variant.match), selectors, 0, aliases);
}

function skipBlank(text: string, from: number): number {
  let at = from;
  while (at < text.length && /\s/u.test(text.charAt(at))) {
    at += 1;
  }
  return at;
}

function readUntil(
  text: string,
  from: number,
  stops: string,
): [string, number] {
  let at = from;
  while (at < text.length && !stops.includes(text.charAt(at))) {
    at += 1;
  }
  return [text.slice(from, at).trim(), at];
}

function parseParts(text: string, from: number): [Part[], number] {
  const parts: Part[] = [];
  let at = from;
  let literal = "";
  const flush = (): void => {
    if (literal !== "") {
      parts.push({ kind: "text", text: literal });
      literal = "";
    }
  };
  while (at < text.length && text.charAt(at) !== "}") {
    if (text.charAt(at) !== "{") {
      literal += text.charAt(at);
      at += 1;
      continue;
    }
    flush();
    const [name, afterName] = readUntil(text, at + 1, ",}");
    if (text.charAt(afterName) === "}") {
      parts.push({ kind: "argument", name, type: "" });
      at = afterName + 1;
      continue;
    }
    const [type, afterType] = readUntil(text, afterName + 1, ",}");
    if (type !== "plural") {
      parts.push({ kind: "argument", name, type });
      at = afterType + 1;
      continue;
    }
    const branches: { category: string; parts: Part[] }[] = [];
    at = skipBlank(text, afterType + 1);
    while (text.charAt(at) !== "}") {
      const [category, afterCategory] = readUntil(text, at, " \t\n{");
      const open = skipBlank(text, afterCategory);
      if (text.charAt(open) !== "{") {
        throw new Error(`expected { after the plural category ${category}`);
      }
      const [inner, afterInner] = parseParts(text, open + 1);
      branches.push({ category, parts: inner });
      at = skipBlank(text, afterInner + 1);
    }
    parts.push({ kind: "plural", name, branches });
    at += 1;
  }
  flush();
  return [parts, at];
}

function partsToText(
  parts: readonly Part[],
  numberAliases: ReadonlyMap<string, string>,
): string {
  return parts
    .map((part) => {
      if (part.kind === "text") {
        return part.text;
      }
      if (part.kind === "plural") {
        throw new Error("a plural cannot sit inside text");
      }
      if (part.type === "number") {
        const alias = numberAliases.get(part.name);
        if (alias === undefined) {
          throw new Error(`the source has no number format for ${part.name}`);
        }
        return `{${alias}}`;
      }
      return `{${part.name}}`;
    })
    .join("");
}

function collectRows(
  parts: readonly Part[],
  selectors: readonly string[],
  inputToSelector: ReadonlyMap<string, string>,
  numberAliases: ReadonlyMap<string, string>,
  chosen: readonly string[],
  rows: Record<string, string>,
): void {
  const [only] = parts;
  if (parts.length === 1 && only?.kind === "plural") {
    const selector = inputToSelector.get(only.name);
    if (selector === undefined || selector !== selectors[chosen.length]) {
      throw new Error(`the plural on ${only.name} is out of order`);
    }
    for (const branch of only.branches) {
      collectRows(
        branch.parts,
        selectors,
        inputToSelector,
        numberAliases,
        [...chosen, `${selector}=${branch.category}`],
        rows,
      );
    }
    return;
  }
  const key = [
    ...chosen,
    ...selectors
      .slice(chosen.length)
      .map((selector) => `${selector}=${WILDCARD}`),
  ].join(", ");
  rows[chosen.length === 0 && selectors.length === 0 ? WILDCARD : key] =
    partsToText(parts, numberAliases);
}

export function fromIcu(icu: string, source: Message): Message {
  if (typeof source === "string") {
    return icu;
  }
  const [variant] = source;
  const aliases = aliasesOf(variant.declarations ?? []);
  const selectors = variant.selectors ?? [];
  const inputToSelector = new Map<string, string>();
  const numberAliases = new Map<string, string>();
  for (const [name, alias] of aliases) {
    if (alias.fn === "plural") {
      inputToSelector.set(alias.input, name);
    } else if (alias.fn === "number") {
      numberAliases.set(alias.input, name);
    }
  }
  const [parts] = parseParts(icu, 0);
  const rows: Record<string, string> = {};
  collectRows(parts, selectors, inputToSelector, numberAliases, [], rows);
  return [
    {
      ...(variant.declarations === undefined
        ? {}
        : { declarations: variant.declarations }),
      ...(variant.selectors === undefined
        ? {}
        : { selectors: variant.selectors }),
      match: rows,
    },
  ];
}

export function toIcuFile(messages: Messages): Record<string, string> {
  return Object.fromEntries(
    Object.entries(messages)
      .filter(([key]) => !key.startsWith("$"))
      .map(([key, message]) => [key, toIcu(message)]),
  );
}

export function fromIcuFile(
  icu: Readonly<Record<string, string>>,
  source: Messages,
): Record<string, Message> {
  return Object.fromEntries(
    Object.entries(icu).map(([key, text]) => {
      const original = source[key];
      if (original === undefined) {
        throw new Error(`the source has no message ${key}`);
      }
      return [key, fromIcu(text, original)];
    }),
  );
}
