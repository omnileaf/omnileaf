import type { LucideIcon } from "@lucide/svelte";

export type NoticeTone = "info" | "warning";

export interface NoticeAction {
  readonly label: string;
  readonly emphasis: "primary" | "quiet";
  readonly run: () => void;
}

export interface Notice {
  readonly tone: NoticeTone;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly actions: readonly NoticeAction[];
}

export interface UndoOffer {
  readonly message: string;
  readonly undo: () => void;
}

type Showing =
  | { readonly kind: "notice"; readonly notice: Notice }
  | { readonly kind: "undo"; readonly offer: UndoOffer };

export const UNDO_WINDOW_MS = 10_000;

/** The notice or undo offer on screen, at most one: showing another replaces it. */
export class Notices {
  #showing: Showing | undefined = $state.raw();
  #lapse: ReturnType<typeof setTimeout> | undefined;

  get shown(): Notice | undefined {
    return this.#showing?.kind === "notice" ? this.#showing.notice : undefined;
  }

  get undoOffer(): UndoOffer | undefined {
    return this.#showing?.kind === "undo" ? this.#showing.offer : undefined;
  }

  show(notice: Notice): void {
    this.#replace({ kind: "notice", notice });
  }

  offerUndo(offer: UndoOffer): void {
    this.#replace({ kind: "undo", offer });
    this.#startLapse();
  }

  undo(): void {
    const offer = this.undoOffer;
    if (offer === undefined) {
      return;
    }
    this.dismiss();
    offer.undo();
  }

  hold(): void {
    clearTimeout(this.#lapse);
  }

  release(): void {
    if (this.undoOffer !== undefined) {
      this.#startLapse();
    }
  }

  dismiss(): void {
    this.#replace(undefined);
  }

  withdraw(notice: Notice): void {
    if (this.shown === notice) {
      this.dismiss();
    }
  }

  act(action: NoticeAction): void {
    this.dismiss();
    action.run();
  }

  #replace(showing: Showing | undefined): void {
    clearTimeout(this.#lapse);
    this.#showing = showing;
  }

  #startLapse(): void {
    clearTimeout(this.#lapse);
    this.#lapse = setTimeout(() => {
      this.dismiss();
    }, UNDO_WINDOW_MS);
  }
}
