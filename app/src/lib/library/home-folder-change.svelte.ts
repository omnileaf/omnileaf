import { FolderX, TriangleAlert } from "@lucide/svelte";

import { assertNever } from "#lib/assert-never.ts";
import type {
  ChosenHomeFolder,
  commands,
  FoundLibrary,
  IpcErrorCode,
} from "#lib/ipc/bindings.ts";
import type { Notice, Notices } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

import {
  type FailureCopy,
  FOLDER_CHOOSER_MISSING,
  FOLDER_UNREADABLE,
} from "./folder-adding.svelte";

export interface HomeCommands {
  readonly choose: typeof commands.chooseHomeFolder;
  readonly use: typeof commands.useFoundLibrary;
  readonly move: typeof commands.moveHomeFolder;
}

export interface FoundHome {
  readonly location: string;
  readonly library: FoundLibrary;
}

export type HomeChange =
  | { readonly kind: "idle" }
  | { readonly kind: "choosing"; readonly found: FoundHome | undefined }
  | { readonly kind: "found"; readonly found: FoundHome }
  | { readonly kind: "moving" }
  | { readonly kind: "using"; readonly found: FoundHome };

interface Warning extends FailureCopy {
  readonly retry: () => string;
}

const CHANGE_FAILED: Warning = {
  icon: TriangleAlert,
  title: m.home_change_failed_title,
  body: m.home_change_failed_body,
  retry: m.library_choose_another_folder,
};

const OVERLAPS_HOME: Warning = {
  icon: FolderX,
  title: m.home_choice_overlaps_title,
  body: m.home_choice_overlaps_body,
  retry: m.library_choose_another_folder,
};

const FROM_A_NEWER_VERSION: Warning = {
  icon: TriangleAlert,
  title: m.home_choice_newer_title,
  body: m.home_choice_newer_body,
  retry: m.library_choose_another_folder,
};

function failureWarning(code: IpcErrorCode): Warning {
  switch (code) {
    case "folderUnreadable":
      return { ...FOLDER_UNREADABLE, retry: m.library_choose_another_folder };
    case "folderChooserMissing":
      return { ...FOLDER_CHOOSER_MISSING, retry: m.home_change_try_again };
    default:
      return CHANGE_FAILED;
  }
}

const IDLE: HomeChange = { kind: "idle" };

export class HomeFolderChange {
  change: HomeChange = $state(IDLE);
  #warning: Notice | undefined;

  constructor(
    private readonly homeCommands: HomeCommands,
    private readonly notices: () => Notices,
  ) {}

  get isBusy(): boolean {
    return (
      this.change.kind === "choosing" ||
      this.change.kind === "moving" ||
      this.change.kind === "using"
    );
  }

  get found(): FoundHome | undefined {
    return "found" in this.change ? this.change.found : undefined;
  }

  async choose(): Promise<void> {
    if (this.isBusy) {
      return;
    }
    this.#withdrawWarning();
    const before = this.change;
    this.change = { kind: "choosing", found: this.found };
    const result = await this.homeCommands.choose();
    if (result.status === "error") {
      this.change = before;
      this.#warn(failureWarning(result.error.code));
      return;
    }
    if (result.data === null) {
      this.change = before;
      return;
    }
    await this.#actOn(result.data);
  }

  async use(): Promise<void> {
    const before = this.change;
    if (before.kind !== "found") {
      return;
    }
    this.#withdrawWarning();
    this.change = { kind: "using", found: before.found };
    const result = await this.homeCommands.use();
    if (result.status === "error") {
      this.change = before;
      this.#warn(CHANGE_FAILED);
    }
  }

  clearFound(): void {
    if (this.change.kind === "found") {
      this.change = IDLE;
    }
  }

  async #actOn({ location, choice }: ChosenHomeFolder): Promise<void> {
    switch (choice.kind) {
      case "current":
        this.change = IDLE;
        return;
      case "found":
        this.change = {
          kind: "found",
          found: { location, library: choice.library },
        };
        return;
      case "overlapsHome":
        this.change = IDLE;
        this.#warn(OVERLAPS_HOME);
        return;
      case "foundFromANewerVersion":
        this.change = IDLE;
        this.#warn(FROM_A_NEWER_VERSION);
        return;
      case "empty":
        await this.#move();
        return;
      default:
        assertNever(choice);
    }
  }

  async #move(): Promise<void> {
    this.change = { kind: "moving" };
    const result = await this.homeCommands.move();
    if (result.status === "error") {
      this.change = IDLE;
      this.#warn(CHANGE_FAILED);
    }
  }

  #warn({ icon, title, body, retry }: Warning): void {
    this.#warning = {
      tone: "warning",
      icon,
      title: title(),
      body: body(),
      action: {
        label: retry(),
        run: () => {
          void this.choose();
        },
      },
    };
    this.notices().show(this.#warning);
  }

  #withdrawWarning(): void {
    if (this.#warning !== undefined) {
      this.notices().withdraw(this.#warning);
      this.#warning = undefined;
    }
  }
}
