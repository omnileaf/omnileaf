const SCALE_LOCKS = new Set(["maximum-scale", "user-scalable"]);

function withoutScaleLocks(content: string): string {
  return content
    .split(",")
    .filter((setting) => !SCALE_LOCKS.has(setting.split("=")[0]?.trim() ?? ""))
    .join(",");
}

/** Lets the page be pinched to zoom while the reader is open, and returns what locks the interface's scale again. */
export function allowPinchZoom(): () => void {
  const root = document.documentElement;
  const viewport = document.querySelector<HTMLMetaElement>(
    'meta[name="viewport"]',
  );
  const locked = viewport?.content;
  root.dataset.pinchZoom = "";
  if (viewport !== null && locked !== undefined) {
    viewport.content = withoutScaleLocks(locked);
  }
  return () => {
    delete root.dataset.pinchZoom;
    if (viewport !== null && locked !== undefined) {
      viewport.content = locked;
    }
  };
}
