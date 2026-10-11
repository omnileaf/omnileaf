import type { InterfaceError } from "#lib/ipc/bindings.ts";

type ErrorDelivery = (error: InterfaceError) => void;

export class InterfaceErrorRelay {
  #waiting: InterfaceError | undefined;

  #deliver: ErrorDelivery | undefined;

  readonly hear = (error: InterfaceError): void => {
    if (this.#deliver === undefined) {
      this.#waiting ??= error;
      return;
    }
    this.#deliver(error);
  };

  deliverTo(onError: ErrorDelivery): () => void {
    this.#deliver = onError;
    const waiting = this.#waiting;
    this.#waiting = undefined;
    if (waiting !== undefined) {
      onError(waiting);
    }
    return () => {
      if (this.#deliver === onError) {
        this.#deliver = undefined;
      }
    };
  }
}

export const appInterfaceErrors = new InterfaceErrorRelay();
