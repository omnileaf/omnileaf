import type { Page } from "@playwright/test";
import type { Channel } from "@tauri-apps/api/core";

import type { commands, IpcError } from "../../src/lib/ipc/bindings.ts";

type Commands = typeof commands;

type Success<Result> = Extract<Result, { status: "ok"; data: unknown }>;

type Outcome<Result> = [Success<Result>] extends [never]
  ? Result
  : Success<Result>["data"];

/** The end of a channel the fake backend holds, sending each message to the page as the Rust side would. */
export interface FakeChannel<Message> {
  send(message: Message): Promise<void>;
}

/** A value as it crosses the bridge, where branded ids are the plain strings they're minted from. */
type Wire<Value> =
  Value extends Channel<infer Message>
    ? FakeChannel<Message>
    : Value extends { readonly __brand: string }
      ? string
      : Value extends object
        ? { [Key in keyof Value]: Wire<Value[Key]> }
        : Value;

type Answer<Name extends keyof Commands> = Wire<
  Outcome<Awaited<ReturnType<Commands[Name]>>>
>;

export type FakeBackend = {
  [Name in keyof Commands]: (
    ...args: Wire<Parameters<Commands[Name]>>
  ) => Answer<Name> | Promise<Answer<Name>>;
};

/** Thrown by a fake command to fail the way the Rust side does, with a typed error. */
export class CommandFailure extends Error {
  constructor(readonly error: IpcError) {
    super(error.message);
  }
}

type CommandArguments = Record<string, unknown>;

type Reply = { readonly value: unknown } | { readonly failure: IpcError };

declare global {
  interface Window {
    __omnileafFakeChannelMessage?: (id: number, message: unknown) => void;
    __omnileafFakeEvent?: (event: string, payload: unknown) => void;
  }
}

const BRIDGE = "__omnileafFakeInvoke";
const FAKE_PROTOCOL_PREFIX = "__protocol__/";

/** Where the page asks for what a custom protocol such as `omni` would serve, as a route on the preview server a spec can answer. */
export function fakeProtocolRoute(protocol: string): string {
  return `**/${FAKE_PROTOCOL_PREFIX}${protocol}/**`;
}
const CHANNEL_PREFIX = "__CHANNEL__:";

const INSTALL_BRIDGE = `const callbacks = new Map();
const listeners = new Map();
let lastCallback = 0;
window.__omnileafFakeChannelMessage = (id, message) => callbacks.get(id)?.(message);
window.__omnileafFakeEvent = (event, payload) => {
  for (const handler of listeners.get(event) ?? []) {
    callbacks.get(handler)?.({ event, id: handler, payload });
  }
};
const EVENT_COMMANDS = {
  "plugin:event|listen": ({ event, handler }) => {
    listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    return handler;
  },
  "plugin:event|unlisten": ({ event, eventId }) => {
    listeners.set(event, (listeners.get(event) ?? []).filter((handler) => handler !== eventId));
    return null;
  },
};
Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", {
  value: { unregisterListener: (_event, id) => callbacks.delete(id) },
});
Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {
    transformCallback: (callback) => {
      lastCallback += 1;
      callbacks.set(lastCallback, callback);
      return lastCallback;
    },
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (path, protocol) => location.origin + "/${FAKE_PROTOCOL_PREFIX}" + protocol + "/" + encodeURIComponent(path),
    invoke: async (command, args) => {
      if (command in EVENT_COMMANDS) {
        return EVENT_COMMANDS[command](args);
      }
      const reply = await window.${BRIDGE}(command, JSON.parse(JSON.stringify(args)));
      if ("failure" in reply) {
        throw reply.failure;
      }
      return reply.value;
    },
  },
});`;

function bindingName(command: string): string {
  return command.replace(/_([a-z0-9])/g, (_, next: string) =>
    next.toUpperCase(),
  );
}

function isCommand(
  backend: FakeBackend,
  name: string,
): name is keyof FakeBackend {
  return Object.hasOwn(backend, name);
}

/** Turns a channel, which crosses the bridge as its id, back into something the fake can send on. */
function onTheFakeSide(page: Page, value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith(CHANNEL_PREFIX)) {
    return value;
  }
  const id = Number(value.slice(CHANNEL_PREFIX.length));
  let index = 0;
  const channel: FakeChannel<unknown> = {
    send: async (message) => {
      await page.evaluate(
        ([channelId, indexed]) => {
          window.__omnileafFakeChannelMessage?.(channelId, indexed);
        },
        [id, { index: index++, message }] as const,
      );
    },
  };
  return channel;
}

/**
 * The bindings send arguments as an object in parameter order, so its values
 * line up with the handler's parameters.
 */
async function answer(
  page: Page,
  backend: FakeBackend,
  command: string,
  args: CommandArguments,
): Promise<Reply> {
  const name = bindingName(command);
  if (!isCommand(backend, name)) {
    throw new Error(`the fake backend has no command \`${command}\``);
  }
  try {
    const value: unknown = await Reflect.apply(
      backend[name],
      undefined,
      Object.values(args).map((arg) => onTheFakeSide(page, arg)),
    );
    return { value };
  } catch (error) {
    if (error instanceof CommandFailure) {
      return { failure: error.error };
    }
    throw error;
  }
}

/** Sends an event to the page the way the Rust side emits one to every window. */
export async function emitFakeEvent(
  page: Page,
  event: string,
  payload: unknown = null,
): Promise<void> {
  await page.evaluate(
    ([name, sent]) => {
      window.__omnileafFakeEvent?.(name, sent);
    },
    [event, payload] as const,
  );
}

export async function installFakeBackend(
  page: Page,
  backend: FakeBackend,
): Promise<void> {
  await page.exposeFunction(BRIDGE, (command: string, args: CommandArguments) =>
    answer(page, backend, command, args),
  );
  await page.addInitScript({ content: INSTALL_BRIDGE });
}
