import {
  copyText,
  type ClipboardWriter,
  type CopyOutcome,
} from "#lib/copy-text.ts";

export interface CopyDependencies {
  readonly clipboard: () => ClipboardWriter | undefined;
  readonly select: () => void;
  readonly settle: () => Promise<void>;
}

export class CopyControl {
  readonly #dependencies: CopyDependencies;
  #outcome: CopyOutcome | undefined = $state();

  constructor(dependencies: CopyDependencies) {
    this.#dependencies = dependencies;
  }

  get outcome(): CopyOutcome | undefined {
    return this.#outcome;
  }

  async copy(text: string): Promise<void> {
    const { clipboard, select, settle } = this.#dependencies;
    this.#outcome = undefined;
    await settle();
    this.#outcome = await copyText({
      text,
      clipboard: clipboard(),
      select,
    });
  }
}
