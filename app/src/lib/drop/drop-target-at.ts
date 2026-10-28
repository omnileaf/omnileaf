export type DropTarget = "readNow" | "add" | "copy";

const DROP_TARGETS: readonly string[] = [
  "readNow",
  "add",
  "copy",
] satisfies DropTarget[];

function isDropTarget(name: string | undefined): name is DropTarget {
  return name !== undefined && DROP_TARGETS.includes(name);
}

export function dropTargetAt(x: number, y: number): DropTarget | null {
  const name = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-drop-target]")?.dataset["dropTarget"];
  return isDropTarget(name) ? name : null;
}
