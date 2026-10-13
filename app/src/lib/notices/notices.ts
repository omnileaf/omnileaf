import { type Component, createContext } from "svelte";
import { toast } from "svelte-sonner";

import type { Glyph } from "#lib/page/glyph.ts";

import NoticeToast from "./NoticeToast.svelte";
import UndoToast from "./UndoToast.svelte";

export type NoticeTone = "plain" | "warning";

export type Politeness = "polite" | "assertive";

export interface NoticeAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Notice {
  readonly tone: NoticeTone;
  readonly icon: Glyph;
  readonly title: string;
  readonly body?: string;
  readonly action?: NoticeAction;
}

export interface UndoOffer {
  readonly title: string;
  readonly body?: string;
  readonly undo: () => void;
}

export interface ToastHandle {
  readonly dismiss: () => void;
  readonly lapse: (windowMs: number) => void;
}

export const UNDO_WINDOW_MS = 10_000;
export const NOTICE_WINDOW_MS = 5_000;

interface Lapse {
  readonly windowMs: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface Shown {
  readonly id: string;
  readonly toast: ToastHandle;
}

let toastsMade = 0;

export class Notices {
  #isHeld = false;
  readonly #lapses = new Map<string, Lapse>();
  readonly #noticesShown = new Map<Notice, Shown>();
  #undoShown: (Shown & { readonly offer: UndoOffer }) | undefined;

  get undoOffer(): UndoOffer | undefined {
    return this.#undoShown?.offer;
  }

  show(notice: Notice): void {
    const shown = this.#present(
      NoticeToast,
      (toast) => ({ notice, toast }),
      notice.tone === "warning" ? "assertive" : "polite",
    );
    this.#noticesShown.set(notice, shown);
    if (notice.tone === "plain") {
      shown.toast.lapse(NOTICE_WINDOW_MS);
    }
  }

  offerUndo(offer: UndoOffer): void {
    this.#undoShown?.toast.dismiss();
    const shown = this.#present(
      UndoToast,
      (toast) => ({ offer, toast }),
      "polite",
    );
    this.#undoShown = { ...shown, offer };
    shown.toast.lapse(UNDO_WINDOW_MS);
  }

  undo(): void {
    const shown = this.#undoShown;
    if (shown === undefined) {
      return;
    }
    shown.toast.dismiss();
    shown.offer.undo();
  }

  withdraw(notice: Notice): void {
    this.#noticesShown.get(notice)?.toast.dismiss();
  }

  hold(): void {
    this.#isHeld = true;
    for (const lapse of this.#lapses.values()) {
      clearTimeout(lapse.timer);
      lapse.timer = undefined;
    }
  }

  release(): void {
    this.#isHeld = false;
    for (const [id, lapse] of this.#lapses) {
      this.#startLapse(id, lapse);
    }
  }

  present<Props extends Record<string, unknown>>(
    content: Component<Props>,
    propsFor: (toast: ToastHandle) => Props,
    politeness: Politeness,
  ): ToastHandle {
    return this.#present(content, propsFor, politeness).toast;
  }

  #present<Props extends Record<string, unknown>>(
    content: Component<Props>,
    propsFor: (toast: ToastHandle) => Props,
    politeness: Politeness,
  ): Shown {
    toastsMade += 1;
    const id = `notice-${String(toastsMade)}`;
    const handle: ToastHandle = {
      dismiss: () => {
        this.#forget(id);
        toast.dismiss(id);
      },
      lapse: (windowMs) => {
        const lapse: Lapse = { windowMs, timer: undefined };
        this.#lapses.set(id, lapse);
        if (!this.#isHeld) {
          this.#startLapse(id, lapse);
        }
      },
    };
    toast.custom(content, {
      id,
      duration: Number.POSITIVE_INFINITY,
      componentProps: propsFor(handle),
      important: politeness === "assertive",
      onDismiss: () => {
        this.#forget(id);
      },
    });
    return { id, toast: handle };
  }

  #startLapse(id: string, lapse: Lapse): void {
    clearTimeout(lapse.timer);
    lapse.timer = setTimeout(() => {
      this.#forget(id);
      toast.dismiss(id);
    }, lapse.windowMs);
  }

  #forget(id: string): void {
    clearTimeout(this.#lapses.get(id)?.timer);
    this.#lapses.delete(id);
    for (const [notice, shown] of this.#noticesShown) {
      if (shown.id === id) {
        this.#noticesShown.delete(notice);
      }
    }
    if (this.#undoShown?.id === id) {
      this.#undoShown = undefined;
    }
  }
}

export const [getNotices, setNotices] = createContext<Notices>();
