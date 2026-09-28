import type { Page } from "@playwright/test";

import type { commands, IpcError } from "../../src/lib/ipc/bindings.ts";

type Commands = typeof commands;

type Success<Result> = Extract<Result, { status: "ok"; data: unknown }>;

type Outcome<Result> = [Success<Result>] extends [never]
  ? Result
  : Success<Result>["data"];

export type FakeBackend = {
  [Name in keyof Commands]: (
    ...args: Parameters<Commands[Name]>
  ) => Outcome<Awaited<ReturnType<Commands[Name]>>>;
};

/** Thrown by a fake command to fail the way the Rust side does, with a typed error. */
export class CommandFailure extends Error {
  constructor(readonly error: IpcError) {
    super(error.message);
  }
}

type CommandArguments = Record<string, unknown>;

type Reply = { readonly value: unknown } | { readonly failure: IpcError };

const BRIDGE = "__omnileafFakeInvoke";

const INSTALL_BRIDGE = `Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: {
    invoke: async (command, args) => {
      const reply = await window.${BRIDGE}(command, args);
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

/**
 * The bindings send arguments as an object in parameter order, so its values
 * line up with the handler's parameters.
 */
function answer(
  backend: FakeBackend,
  command: string,
  args: CommandArguments,
): Reply {
  const name = bindingName(command);
  if (!isCommand(backend, name)) {
    throw new Error(`the fake backend has no command \`${command}\``);
  }
  try {
    const value: unknown = Reflect.apply(
      backend[name],
      undefined,
      Object.values(args),
    );
    return { value };
  } catch (error) {
    if (error instanceof CommandFailure) {
      return { failure: error.error };
    }
    throw error;
  }
}

export async function installFakeBackend(
  page: Page,
  backend: FakeBackend,
): Promise<void> {
  await page.exposeFunction(BRIDGE, (command: string, args: CommandArguments) =>
    answer(backend, command, args),
  );
  await page.addInitScript({ content: INSTALL_BRIDGE });
}
