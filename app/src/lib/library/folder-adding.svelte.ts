import { FolderX, Lock, type LucideIcon, TriangleAlert } from "@lucide/svelte";

import type { commands, FolderSurvey, IpcErrorCode } from "$lib/ipc/bindings";
import type { Notice, Notices } from "$lib/notices/notices.svelte";
import { m } from "$lib/paraglide/messages.js";

export type AddFolder = typeof commands.addLibraryFolder;

export type FolderOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "adding" }
  | { readonly kind: "found"; readonly survey: FolderSurvey };

interface Failure {
  readonly icon: LucideIcon;
  readonly title: () => string;
  readonly body: () => string;
  readonly retry: (() => string) | undefined;
}

const ADDING_FAILED: Failure = {
  icon: TriangleAlert,
  title: m.library_add_folder_failed_title,
  body: m.library_add_folder_failed_body,
  retry: m.library_add_folder_try_again,
};

const FAILURES = {
  folderUnreadable: {
    icon: Lock,
    title: m.library_folder_unreadable_title,
    body: m.library_folder_unreadable_body,
    retry: m.library_choose_another_folder,
  },
  folderPickerUnavailable: {
    icon: FolderX,
    title: m.library_folder_picker_unavailable_title,
    body: m.library_folder_picker_unavailable_body,
    retry: undefined,
  },
  clipboardUnavailable: ADDING_FAILED,
  browserUnavailable: ADDING_FAILED,
  internal: ADDING_FAILED,
} satisfies Record<IpcErrorCode, Failure>;

/** One Add a folder flow, shared by every button that starts it and the notice that reports it. */
export class FolderAdding {
  outcome: FolderOutcome = $state({ kind: "idle" });
  #failure: Notice | undefined;

  constructor(
    private readonly addFolder: AddFolder,
    private readonly notices: () => Notices,
  ) {}

  get isAdding(): boolean {
    return this.outcome.kind === "adding";
  }

  async add(): Promise<void> {
    this.outcome = { kind: "adding" };
    const result = await this.addFolder();
    if (result.status === "error") {
      this.outcome = { kind: "idle" };
      this.#failure = this.#failureNotice(result.error.code);
      this.notices().show(this.#failure);
      return;
    }
    this.withdrawFailure();
    this.outcome =
      result.data === null
        ? { kind: "idle" }
        : { kind: "found", survey: result.data };
  }

  dismiss(): void {
    this.outcome = { kind: "idle" };
  }

  withdrawFailure(): void {
    if (this.#failure !== undefined) {
      this.notices().withdraw(this.#failure);
    }
  }

  #failureNotice(code: IpcErrorCode): Notice {
    const { icon, title, body, retry }: Failure = FAILURES[code];
    return {
      tone: "warning",
      icon,
      title: title(),
      body: body(),
      actions:
        retry === undefined
          ? []
          : [
              {
                label: retry(),
                emphasis: "primary",
                run: () => {
                  void this.add();
                },
              },
            ],
    };
  }
}
