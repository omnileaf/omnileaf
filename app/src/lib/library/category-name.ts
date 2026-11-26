export type CategoryNameProblem = "empty" | "taken";

export interface RefusedName {
  readonly name: string;
  readonly problem: CategoryNameProblem;
}

const RUNS_OF_SPACE = /\s+/gu;

function comparableName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFKC")
    .trim()
    .replace(RUNS_OF_SPACE, " ");
}

export function categoryNameProblem(
  typed: string,
  otherNames: readonly string[],
): CategoryNameProblem | undefined {
  const wanted = comparableName(typed);
  if (wanted === "") {
    return "empty";
  }
  return otherNames.some((name) => comparableName(name) === wanted)
    ? "taken"
    : undefined;
}
