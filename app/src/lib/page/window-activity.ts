const ATTRIBUTE = "data-window-active";

export function followWindowActivity(target: Window): () => void {
  const root = document.documentElement;
  const deactivate = (): void => {
    root.setAttribute(ATTRIBUTE, "false");
  };
  const activate = (): void => {
    root.removeAttribute(ATTRIBUTE);
  };
  target.addEventListener("blur", deactivate);
  target.addEventListener("focus", activate);
  return () => {
    target.removeEventListener("blur", deactivate);
    target.removeEventListener("focus", activate);
    activate();
  };
}
