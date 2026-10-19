import type { MissingFolder } from "#lib/ipc/bindings.ts";
import type { Notices, ToastHandle } from "#lib/notices/notices.ts";

import MissingFolderToast from "./MissingFolderToast.svelte";

export interface MissingFolderActions {
  readonly showAnyway: (missing: MissingFolder) => void;
  readonly find: (missing: MissingFolder) => void;
  readonly unlink: (missing: MissingFolder) => void;
  readonly signIn: (missing: MissingFolder) => void;
}

const dismissedThisVisit = new Set<string>();

/** One warning for each missing folder whose series are hidden, until it's fixed, or dismissed for as long as the app stays open. */
export class MissingFolderNotices {
  readonly #shown = new Map<string, ToastHandle>();

  constructor(
    private readonly notices: Notices,
    private readonly handlers: MissingFolderActions,
  ) {}

  show(missing: readonly MissingFolder[]): void {
    const wanted = missing.filter(
      ({ folder, isShownAnyway }) =>
        !isShownAnyway && !dismissedThisVisit.has(folder.id),
    );
    const wantedIds = new Set<string>(wanted.map(({ folder }) => folder.id));
    for (const [id, toast] of this.#shown) {
      if (!wantedIds.has(id)) {
        this.#shown.delete(id);
        toast.dismiss();
      }
    }
    for (const folder of wanted) {
      const { id } = folder.folder;
      if (this.#shown.has(id)) {
        continue;
      }
      const toast = this.notices.present(
        MissingFolderToast,
        (handle) => ({
          missing: folder,
          toast: {
            ...handle,
            dismiss: () => {
              dismissedThisVisit.add(id);
              this.#shown.delete(id);
              handle.dismiss();
            },
          },
          handlers: this.handlers,
        }),
        "assertive",
      );
      this.#shown.set(id, toast);
    }
  }

  withdrawAll(): void {
    for (const toast of this.#shown.values()) {
      toast.dismiss();
    }
    this.#shown.clear();
  }
}
