const STARTING_CLASS = /(?<=^|[\s"'`])((?:[\w-]+:)*?)starting:([\w./-]+)/g;
const STARTING_BLOCK = "@starting-style";
const DATA_STARTING_STYLE = "[data-starting-style]";

function classProblems(source: string): string[] {
  return [...source.matchAll(STARTING_CLASS)].flatMap(
    ([found, variants = "", utility = ""]) => {
      const twin = `${variants}data-starting-style:${utility}`;
      return source.includes(twin) ? [] : [`${found} needs ${twin} beside it`];
    },
  );
}

interface Block {
  readonly selector: string;
  readonly start: number;
  hasStartingStyle: boolean;
}

function blockProblems(source: string): string[] {
  const problems: string[] = [];
  const open: Block[] = [];
  let selectorStart = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      const selector = source.slice(selectorStart, index).trim();
      if (selector === STARTING_BLOCK) {
        const parent = open.at(-1);
        if (parent !== undefined) {
          parent.hasStartingStyle = true;
        }
      }
      open.push({ selector, start: index, hasStartingStyle: false });
      selectorStart = index + 1;
    } else if (character === "}") {
      const block = open.pop();
      if (
        block?.hasStartingStyle === true &&
        !source.slice(block.start, index).includes(DATA_STARTING_STYLE)
      ) {
        problems.push(
          `${STARTING_BLOCK} in ${block.selector} needs a ${DATA_STARTING_STYLE} rule beside it`,
        );
      }
      selectorStart = index + 1;
    } else if (character === ";") {
      selectorStart = index + 1;
    }
  }
  return problems;
}

/** Names each starting style that has no data-starting-style twin, since WebKit can skip @starting-style on an element inserted after the page loads, while bits-ui holds data-starting-style for the element's first frame. */
export function startingStyleProblems(source: string): string[] {
  return [...classProblems(source), ...blockProblems(source)];
}
