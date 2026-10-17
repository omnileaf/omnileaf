const TRIGRAM_CHARS = 3;

export interface ClosestWords {
  readonly slips: number;
  readonly words: string;
}

/** Letters added, dropped, changed or swapped with the next, as optimal string alignment counts them, matching the library's own count. */
export function slips(from: string, to: string): number {
  const typed = Array.from(from);
  const target = Array.from(to);
  let beforeLast: number[] = [];
  let last = Array.from({ length: target.length + 1 }, (_, index) => index);
  typed.forEach((fromChar, row) => {
    const current = [row + 1];
    target.forEach((toChar, column) => {
      let fewest = Math.min(
        (last[column + 1] ?? 0) + 1,
        (current[column] ?? 0) + 1,
        (last[column] ?? 0) + (fromChar === toChar ? 0 : 1),
      );
      if (
        row > 0 &&
        column > 0 &&
        fromChar === target[column - 1] &&
        typed[row - 1] === toChar
      ) {
        fewest = Math.min(fewest, (beforeLast[column - 1] ?? 0) + 1);
      }
      current.push(fewest);
    });
    beforeLast = last;
    last = current;
  });
  return last[target.length] ?? 0;
}

export function closestWords(
  typed: string,
  title: string,
): ClosestWords | undefined {
  const typedWords = typed.split(" ").length;
  const words = title.split(" ");
  const size = Math.min(typedWords, words.length);
  let closest: ClosestWords | undefined;
  for (let start = 0; start + size <= words.length; start += 1) {
    const window = words.slice(start, start + size).join(" ");
    const counted = slips(typed, window);
    if (closest === undefined || counted < closest.slips) {
      closest = { slips: counted, words: window };
    }
  }
  return closest;
}

export function slipsAllowed(chars: number): number {
  if (chars <= 4) {
    return 1;
  }
  return chars <= 8 ? 2 : 3;
}

export function isTooShortToSuggest(typed: string): boolean {
  return Array.from(typed).length < TRIGRAM_CHARS;
}
