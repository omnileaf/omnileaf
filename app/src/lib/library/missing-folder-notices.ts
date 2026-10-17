import { FolderCheck } from "@lucide/svelte";

import { assertNever } from "#lib/assert-never.ts";

import type { MissingFolder } from "#lib/ipc/bindings.ts";
import type { Notices, ToastHandle } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

import MissingFolderToast from "./MissingFolderToast.svelte";

export interface MissingFolderActions {
  readonly showAnyway: (missing: MissingFolder) => void;
  readonly find: (missing: MissingFolder) => void;
  readonly unlink: (missing: MissingFolder) => void;
  readonly signIn: (missing: MissingFolder) => void;
  readonly tryAgain: (missing: MissingFolder) => void;
}

const dismissedThisVisit = new Set<string>();

function placeOf({ folder, problem }: MissingFolder): string {
  switch (problem.kind) {
    case "needsSignIn":
    case "needsMounting":
    case "shareUnreachable":
      return problem.share.name;
    case "missing":
    case "driveDisconnected":
    case "lostAccess":
      return folder.location;
    default:
      return assertNever(problem);
  }
}

/** One warning for each missing folder whose series are hidden, until it's fixed, or dismissed for as long as the app stays open. */
export class MissingFolderNotices {
  readonly #shown = new Map<string, ToastHandle>();
  readonly #stillFailing = new Set<string>();

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
    for (const id of this.#shown.keys()) {
      if (!wantedIds.has(id)) {
        this.#withdraw(id);
      }
    }
    for (const folder of wanted) {
      if (!this.#shown.has(folder.folder.id)) {
        this.#present(folder);
      }
    }
  }

  stillFailing(missing: MissingFolder): void {
    const { id } = missing.folder;
    this.#shown.get(id)?.dismiss();
    this.#stillFailing.add(id);
    this.#present(missing);
  }

  back(missing: MissingFolder): void {
    this.#withdraw(missing.folder.id);
    this.notices.show({
      tone: "plain",
      icon: FolderCheck,
      title: m.missing_back_title({ name: missing.folder.name }),
      body: m.missing_back_body({ share: placeOf(missing) }),
    });
  }

  withdrawAll(): void {
    for (const id of this.#shown.keys()) {
      this.#withdraw(id);
    }
  }

  #withdraw(id: string): void {
    this.#shown.get(id)?.dismiss();
    this.#shown.delete(id);
    this.#stillFailing.delete(id);
  }

  #present(missing: MissingFolder): void {
    const { id } = missing.folder;
    const toast = this.notices.present(
      MissingFolderToast,
      (handle) => ({
        missing,
        isStillFailing: this.#stillFailing.has(id),
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
