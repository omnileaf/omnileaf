import { type Component, createContext } from "svelte";
import { toast } from "svelte-sonner";

import { CircleCheck } from "@lucide/svelte";

import type { Glyph } from "#lib/page/glyph.ts";

import NoticeToast from "./NoticeToast.svelte";
import { NEW_UNDO_RULES, type UndoRules } from "./undo-setting.svelte";
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
  /** Makes the change for good once it can no longer be undone. */
  readonly commit?: () => void;
}

export interface ToastHandle {
  readonly dismiss: () => void;
  readonly lapse: (windowMs: number) => void;
}

export const UNDO_WINDOW_MS = 10_000;
const MS_PER_SECOND = 1000;
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
  readonly #undoRules: () => UndoRules;
  readonly #lapses = new Map<string, Lapse>();
  readonly #noticesShown = new Map<Notice, Shown>();
  #undoShown: (Shown & { readonly offer: UndoOffer }) | undefined;
  #undoSettling: (Shown & { readonly offer: UndoOffer }) | undefined;

  constructor(undoRules: () => UndoRules = () => NEW_UNDO_RULES) {
    this.#undoRules = undoRules;
  }

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
    const rules = this.#undoRules();
    if (!rules.isOffered) {
      this.show({
        tone: "plain",
        icon: CircleCheck,
        title: offer.title,
        ...(offer.body === undefined ? {} : { body: offer.body }),
      });
      offer.commit?.();
      return;
    }
    this.#undoShown?.toast.dismiss();
    const shown = this.#present(
      UndoToast,
      (toast) => ({
        offer: {
          ...offer,
          undo: () => {
            this.undo();
          },
        },
        toast,
      }),
      "polite",
    );
    this.#undoShown = { ...shown, offer };
    shown.toast.lapse(rules.windowSeconds * MS_PER_SECOND);
  }

  undo(): void {
    const shown = this.#undoShown ?? this.#undoSettling;
    if (shown === undefined) {
      return;
    }
    this.#undoShown = undefined;
    this.#undoSettling = undefined;
    shown.toast.dismiss();
    shown.offer.undo();
  }

  withdraw(notice: Notice): void {
    this.#noticesShown.get(notice)?.toast.dismiss();
  }

  hold(): void {
    if (!this.#undoRules().holdsWhileHoveredOrFocused) {
      return;
    }
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
    let isDismissed = false;
    const handle: ToastHandle = {
      dismiss: () => {
        if (isDismissed) {
          return;
        }
        isDismissed = true;
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
    const undoShown = this.#undoShown;
    if (undoShown?.id === id) {
      this.#undoShown = undefined;
      this.#undoSettling = undoShown;
      queueMicrotask(() => {
        if (this.#undoSettling === undoShown) {
          this.#undoSettling = undefined;
          undoShown.offer.commit?.();
        }
      });
    }
  }
}

export const [getNotices, setNotices] = createContext<Notices>();
