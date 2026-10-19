import type { Page } from "@playwright/test";

import type { IpcError } from "../../src/lib/ipc/bindings.ts";
import {
  bindingName,
  CommandFailure,
  type FakeBackend,
  type FakeChannel,
  isCommand,
} from "../../src/lib/ipc/fake-backend.ts";

export {
  CommandFailure,
  type FakeBackend,
  type FakeChannel,
} from "../../src/lib/ipc/fake-backend.ts";

type CommandArguments = Record<string, unknown>;

type Reply = { readonly value: unknown } | { readonly failure: IpcError };

export interface CommandsAsked {
  readonly asked: number;
  readonly unanswered: number;
}

declare global {
  interface Window {
    __omnileafFakeChannelMessage?: (id: number, message: unknown) => void;
    __omnileafFakeEvent?: (event: string, payload: unknown) => void;
    __omnileafFakeCommands?: () => CommandsAsked;
  }
}

const BRIDGE = "__omnileafFakeInvoke";
const FAKE_PROTOCOL_PREFIX = "__protocol__/";

export function fakeProtocolRoute(protocol: string): string {
  return `**/${FAKE_PROTOCOL_PREFIX}${protocol}/**`;
}

export function fakeProtocolPath(url: string, protocol: string): string {
  const { pathname } = new URL(url);
  const base = `/${FAKE_PROTOCOL_PREFIX}${protocol}/`;
  return decodeURIComponent(
    pathname.slice(pathname.indexOf(base) + base.length),
  );
}

const CHANNEL_PREFIX = "__CHANNEL__:";

const INSTALL_BRIDGE = `const callbacks = new Map();
const listeners = new Map();
let lastCallback = 0;
let asked = 0;
let unanswered = 0;
window.__omnileafFakeCommands = () => ({ asked, unanswered });
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
      asked += 1;
      unanswered += 1;
      try {
        const reply = await window.${BRIDGE}(command, JSON.parse(JSON.stringify(args)));
        if ("failure" in reply) {
          throw reply.failure;
        }
        return reply.value;
      } finally {
        unanswered -= 1;
      }
    },
  },
});`;

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

/** The bindings send arguments as an object in parameter order, so its values line up with the handler's parameters. */
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

export function commandsAsked(page: Page): Promise<CommandsAsked> {
  return page.evaluate(() => {
    const commands = window.__omnileafFakeCommands;
    if (commands === undefined) {
      throw new Error("the page has no fake backend");
    }
    return commands();
  });
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
