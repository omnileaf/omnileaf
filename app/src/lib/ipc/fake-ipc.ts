import type { IpcError } from "./bindings.ts";
import {
  bindingName,
  CommandFailure,
  type FakeBackend,
  type FakeChannel,
  isCommand,
} from "./fake-backend.ts";

export interface FakeIpc {
  emit(event: string, payload: unknown): void;
}

type Callback = (message: unknown) => void;

const INTERNALS = "__TAURI_INTERNALS__";
const EVENT_INTERNALS = "__TAURI_EVENT_PLUGIN_INTERNALS__";
const CHANNEL_PREFIX = "__CHANNEL__:";
const LISTEN = "plugin:event|listen";
const UNLISTEN = "plugin:event|unlisten";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Rejects as Tauri does, with the command's plain error value, which the bindings turn into an error result. */
function rejectWith(error: IpcError): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- the bindings expect a failed command's plain value, not an Error
  throw error;
}

/** Stands in for Tauri's own bridge, so the interface runs in a plain browser against a backend that answers in the page. */
export function installFakeIpc(
  target: Window,
  backend: Partial<FakeBackend>,
  protocolBase: string,
): FakeIpc {
  const callbacks = new Map<number, Callback>();
  const listeners = new Map<string, number[]>();
  let lastCallback = 0;

  function channelFrom(value: unknown): unknown {
    if (typeof value !== "string" || !value.startsWith(CHANNEL_PREFIX)) {
      return value;
    }
    const id = Number(value.slice(CHANNEL_PREFIX.length));
    let index = 0;
    const channel: FakeChannel<unknown> = {
      send: (message) => {
        callbacks.get(id)?.({ index: index++, message });
        return Promise.resolve();
      },
    };
    return channel;
  }

  function listen(args: Record<string, unknown>): unknown {
    const { event, handler } = args;
    if (typeof event === "string" && typeof handler === "number") {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    }
    return handler;
  }

  function unlisten(args: Record<string, unknown>): null {
    const { event, eventId } = args;
    if (typeof event === "string") {
      listeners.set(
        event,
        (listeners.get(event) ?? []).filter((handler) => handler !== eventId),
      );
    }
    return null;
  }

  async function answer(command: string, sent: unknown): Promise<unknown> {
    const args: unknown = JSON.parse(JSON.stringify(sent ?? {}));
    const record = isRecord(args) ? args : {};
    if (command === LISTEN) {
      return listen(record);
    }
    if (command === UNLISTEN) {
      return unlisten(record);
    }
    const name = bindingName(command);
    const handler = isCommand(backend, name) ? backend[name] : undefined;
    if (handler === undefined) {
      return rejectWith({
        code: "internal",
        message: `no fake answer for \`${command}\``,
      });
    }
    try {
      const value: unknown = await Reflect.apply(
        handler,
        undefined,
        Object.values(record).map(channelFrom),
      );
      return value;
    } catch (error) {
      if (error instanceof CommandFailure) {
        return rejectWith(error.error);
      }
      throw error;
    }
  }

  Object.defineProperty(target, EVENT_INTERNALS, {
    configurable: true,
    value: {
      unregisterListener: (_event: string, id: number) => callbacks.delete(id),
    },
  });
  Object.defineProperty(target, INTERNALS, {
    configurable: true,
    value: {
      transformCallback: (callback: Callback) => {
        lastCallback += 1;
        callbacks.set(lastCallback, callback);
        return lastCallback;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      convertFileSrc: (path: string, protocol: string) =>
        `${protocolBase}${protocol}/${encodeURIComponent(path)}`,
      invoke: answer,
    },
  });

  return {
    emit: (event, payload) => {
      for (const handler of listeners.get(event) ?? []) {
        callbacks.get(handler)?.({ event, id: handler, payload });
      }
    },
  };
}

export function removeFakeIpc(target: Window): void {
  Reflect.deleteProperty(target, INTERNALS);
  Reflect.deleteProperty(target, EVENT_INTERNALS);
}
