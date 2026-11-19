import type {
  commands,
  IpcError,
  MissingFolder,
  NetworkShare,
} from "#lib/ipc/bindings.ts";

export type RelocateFolder = (
  missing: MissingFolder,
) => ReturnType<typeof commands.relocateLibraryFolder>;

export interface FolderFinderEvents {
  readonly onError: (error: IpcError) => void;
  readonly onShareStillUnreachable: (missing: MissingFolder) => void;
  readonly onShareBack: (missing: MissingFolder) => void;
  readonly onSettled: () => Promise<void>;
}

export interface ShareToChoose {
  readonly name: string;
  readonly share: NetworkShare;
}

export class FolderFinder {
  #choosingAgain = $state<MissingFolder | undefined>();

  constructor(
    private readonly relocateFolder: RelocateFolder,
    private readonly events: FolderFinderEvents,
  ) {}

  get shareToChoose(): ShareToChoose | undefined {
    const chosen = this.#choosingAgain;
    return chosen?.problem.kind === "shareUnreachable"
      ? { name: chosen.folder.name, share: chosen.problem.share }
      : undefined;
  }

  find(missing: MissingFolder): void {
    if (missing.problem.kind === "shareUnreachable") {
      this.#choosingAgain = missing;
      return;
    }
    void this.relocate(missing);
  }

  continueChoosing(): void {
    const chosen = this.#choosingAgain;
    this.#choosingAgain = undefined;
    if (chosen !== undefined) {
      void this.relocate(chosen);
    }
  }

  stopChoosing(): void {
    this.#choosingAgain = undefined;
  }

  async relocate(missing: MissingFolder): Promise<void> {
    const relocated = await this.relocateFolder(missing);
    if (relocated.status === "error") {
      this.events.onError(relocated.error);
    } else if (
      relocated.data !== null &&
      missing.problem.kind === "shareUnreachable"
    ) {
      if (relocated.data.outcome.kind === "unreachable") {
        this.events.onShareStillUnreachable(missing);
      } else {
        this.events.onShareBack(missing);
      }
    }
    await this.events.onSettled();
  }
}
