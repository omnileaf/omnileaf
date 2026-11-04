import type { DefaultViewer, IpcError } from "#lib/ipc/bindings.ts";

type Answer<T> = Promise<
  { status: "ok"; data: T } | { status: "error"; error: IpcError }
>;

export type ComicViewerBackend = {
  read: () => Answer<DefaultViewer>;
  make: () => Answer<null>;
};

export class ComicViewerChoice {
  isOn = $state(false);
  failed = $state(false);

  constructor(private readonly backend: ComicViewerBackend) {}

  async load(): Promise<void> {
    await this.refresh();
  }

  async turnOn(): Promise<void> {
    this.failed = false;
    const made = await this.backend.make();
    if (made.status === "error") {
      this.failed = true;
      return;
    }
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const read = await this.backend.read();
    if (read.status === "ok") {
      this.isOn = read.data === "omnileaf";
    }
  }
}
