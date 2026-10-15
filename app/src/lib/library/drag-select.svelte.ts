import { on } from "svelte/events";

import type { Selection } from "#lib/page/selection.svelte.ts";

import { type Box, boxBetween, type Point, touchedBy } from "./drag-box";

const DRAG_START_PX = 4;
const LEFT_BUTTON = 0;
const NOT_EMPTY_SPACE =
  "[data-series-id], a, button, input, select, textarea, [role='menu']";

export class DragSelect<Id> {
  box: Box | undefined = $state();

  readonly #selection: Selection<Id>;
  readonly #idOf: (cell: HTMLElement) => Id | undefined;

  constructor(
    selection: Selection<Id>,
    idOf: (cell: HTMLElement) => Id | undefined,
  ) {
    this.#selection = selection;
    this.#idOf = idOf;
  }

  readonly attach = (area: HTMLElement): (() => void) => {
    let start: Point | undefined;
    let pointer: Point | undefined;
    let kept: Id[] = [];
    let isDragging = false;

    const within = ({ x, y }: Point): Point => {
      const frame = area.getBoundingClientRect();
      return { x: x - frame.left, y: y - frame.top };
    };

    const cellsIn = (): (Box & { id: Id })[] => {
      const frame = area.getBoundingClientRect();
      return [
        ...area.querySelectorAll<HTMLElement>("[data-series-id]"),
      ].flatMap((cell) => {
        const id = this.#idOf(cell);
        const { left, top, width, height } = cell.getBoundingClientRect();
        return id === undefined
          ? []
          : [
              {
                id,
                left: left - frame.left,
                top: top - frame.top,
                width,
                height,
              },
            ];
      });
    };

    const follow = (): void => {
      if (start === undefined || pointer === undefined) {
        return;
      }
      const end = within(pointer);
      if (!isDragging) {
        if (Math.hypot(end.x - start.x, end.y - start.y) < DRAG_START_PX) {
          return;
        }
        isDragging = true;
        this.#selection.begin();
      }
      const box = boxBetween(start, end);
      this.box = box;
      this.#selection.pickOnly(touchedBy(box, cellsIn()), kept);
    };

    const stop = (): void => {
      start = undefined;
      pointer = undefined;
      isDragging = false;
      this.box = undefined;
    };

    const stops = [
      on(area, "pointerdown", (event) => {
        if (
          event.button !== LEFT_BUTTON ||
          event.pointerType !== "mouse" ||
          !(event.target instanceof Element) ||
          event.target.closest(NOT_EMPTY_SPACE) !== null
        ) {
          return;
        }
        event.preventDefault();
        area.setPointerCapture(event.pointerId);
        pointer = { x: event.clientX, y: event.clientY };
        start = within(pointer);
        kept =
          event.ctrlKey || event.metaKey || event.shiftKey
            ? this.#selection.picked
            : [];
      }),
      on(area, "pointermove", (event) => {
        if (start !== undefined) {
          pointer = { x: event.clientX, y: event.clientY };
          follow();
        }
      }),
      on(area, "pointerup", stop),
      on(area, "pointercancel", stop),
      on(document, "scroll", follow, { capture: true, passive: true }),
    ];
    return () => {
      for (const stopListening of stops) {
        stopListening();
      }
    };
  };
}
