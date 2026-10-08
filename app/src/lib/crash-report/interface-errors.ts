import type { InterfaceError } from "#lib/ipc/bindings.ts";

const ANNOUNCED_ERROR = "omnileaf:interface-error";

export function describeInterfaceError(reason: unknown): InterfaceError {
  if (reason instanceof Error) {
    return {
      message: `${reason.name}: ${reason.message}`,
      stack: reason.stack ?? null,
    };
  }
  return { message: String(reason), stack: null };
}

/** Hears every error the interface doesn't handle itself, and returns a way to stop listening. */
export function listenForInterfaceErrors(
  target: Window,
  onError: (error: InterfaceError) => void,
): () => void {
  const onUncaught = (event: ErrorEvent): void => {
    onError(describeInterfaceError(event.error ?? event.message));
  };
  const onUnhandled = (event: PromiseRejectionEvent): void => {
    onError(describeInterfaceError(event.reason));
  };
  const onAnnounced = (event: Event): void => {
    if (event instanceof CustomEvent) {
      onError(describeInterfaceError(event.detail));
    }
  };
  target.addEventListener("error", onUncaught);
  target.addEventListener("unhandledrejection", onUnhandled);
  target.addEventListener(ANNOUNCED_ERROR, onAnnounced);
  return () => {
    target.removeEventListener("error", onUncaught);
    target.removeEventListener("unhandledrejection", onUnhandled);
    target.removeEventListener(ANNOUNCED_ERROR, onAnnounced);
  };
}

/** Passes on an error the framework caught, which never reaches the window's own error events. */
export function announceInterfaceError(target: Window, reason: unknown): void {
  target.dispatchEvent(new CustomEvent(ANNOUNCED_ERROR, { detail: reason }));
}
