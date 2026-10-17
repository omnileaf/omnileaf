import {
  type EventCallback,
  listen,
  TauriEvent,
  type UnlistenFn,
} from "@tauri-apps/api/event";

export type DragListen = <Payload>(
  event: TauriEvent,
  handler: EventCallback<Payload>,
) => Promise<UnlistenFn>;

interface DraggedPaths {
  readonly paths: readonly string[];
}

const PATH_PARTS = /[\\/]/;

export function folderNameOf(path: string): string {
  return path.split(PATH_PARTS).findLast((part) => part !== "") ?? path;
}

export class FolderDrops {
  dragged: readonly string[] = $state([]);
  #linking: Promise<void> = Promise.resolve();

  constructor(
    private readonly link: (folder: string) => Promise<void>,
    private readonly listenTo: DragListen = listen,
  ) {}

  watch(): () => void {
    const listening = [
      this.listenTo<DraggedPaths>(TauriEvent.DRAG_ENTER, ({ payload }) => {
        this.dragged = payload.paths;
      }),
      this.listenTo<DraggedPaths>(TauriEvent.DRAG_DROP, ({ payload }) => {
        this.dragged = [];
        for (const folder of payload.paths) {
          this.#linking = this.#linking.then(() => this.link(folder));
        }
      }),
      this.listenTo<null>(TauriEvent.DRAG_LEAVE, () => {
        this.dragged = [];
      }),
    ];
    return () => {
      this.dragged = [];
      for (const stopping of listening) {
        void stopping.then((stop) => {
          stop();
        });
      }
    };
  }

  settled(): Promise<void> {
    return this.#linking;
  }
}
