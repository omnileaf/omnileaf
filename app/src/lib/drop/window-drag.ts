import { getCurrentWebview } from "@tauri-apps/api/webview";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type WindowDrag =
  | { readonly kind: "enter"; readonly paths: string[]; readonly at: Point }
  | { readonly kind: "over"; readonly at: Point }
  | { readonly kind: "drop"; readonly paths: string[]; readonly at: Point }
  | { readonly kind: "leave" };

/** Tauri reports drag positions in physical pixels, while the page lays out in CSS pixels. */
function inPagePixels(position: Point): Point {
  return {
    x: position.x / window.devicePixelRatio,
    y: position.y / window.devicePixelRatio,
  };
}

export function listenForWindowDrag(
  onDrag: (drag: WindowDrag) => void,
  onFailed: (error: unknown) => void,
): () => void {
  const listening = getCurrentWebview()
    .onDragDropEvent(({ payload }) => {
      switch (payload.type) {
        case "enter":
        case "drop":
          onDrag({
            kind: payload.type,
            paths: payload.paths,
            at: inPagePixels(payload.position),
          });
          break;
        case "over":
          onDrag({ kind: "over", at: inPagePixels(payload.position) });
          break;
        case "leave":
          onDrag({ kind: "leave" });
          break;
      }
    })
    .then(
      (stop) => stop,
      (error: unknown) => {
        onFailed(error);
        return undefined;
      },
    );
  return () => {
    void listening.then((stop) => {
      stop?.();
    });
  };
}
