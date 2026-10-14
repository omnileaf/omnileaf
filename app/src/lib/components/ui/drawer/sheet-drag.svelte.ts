import {
  backdropOpacity,
  dragStartFrom,
  isDismissed,
  sheetOffset,
} from "./drag";

interface Press {
  readonly x: number;
  readonly y: number;
  readonly atMs: number;
}

const PRIMARY_BUTTON = 0;

export class SheetDrag {
  offset = $state(0);
  isDragging = $state(false);
  #sheetHeight = $state(1);
  #press: Press | undefined;

  constructor(private readonly onDismiss: () => void) {}

  get backdropOpacity(): number {
    return backdropOpacity(this.offset, this.#sheetHeight);
  }

  pressed(event: PointerEvent, sheet: HTMLElement): void {
    if (!event.isPrimary || event.button !== PRIMARY_BUTTON) {
      return;
    }
    this.#press = {
      x: event.clientX,
      y: event.clientY,
      atMs: performance.now(),
    };
    this.#sheetHeight = sheet.getBoundingClientRect().height;
  }

  moved(event: PointerEvent, sheet: HTMLElement): void {
    const press = this.#press;
    if (press === undefined) {
      return;
    }
    const travel = { x: event.clientX - press.x, y: event.clientY - press.y };
    if (!this.isDragging) {
      const start = dragStartFrom(travel, event.pointerType);
      if (start === "abandoned") {
        this.#press = undefined;
      }
      if (start !== "dragging") {
        return;
      }
      this.isDragging = true;
      sheet.setPointerCapture(event.pointerId);
    }
    this.offset = sheetOffset(travel.y);
  }

  released(): void {
    const press = this.#press;
    this.#press = undefined;
    if (press === undefined || !this.isDragging) {
      return;
    }
    const isClosing = isDismissed({
      offset: this.offset,
      sheetHeight: this.#sheetHeight,
      elapsedMs: performance.now() - press.atMs,
    });
    this.cancelled();
    if (isClosing) {
      this.onDismiss();
    }
  }

  cancelled(): void {
    this.#press = undefined;
    this.isDragging = false;
    this.offset = 0;
  }
}
