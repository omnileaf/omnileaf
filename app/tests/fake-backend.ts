import type { Page } from "@playwright/test";

import type { commands } from "../src/lib/ipc/bindings.ts";

type Commands = typeof commands;

export type FakeBackend = {
  [Name in keyof Commands]: (
    ...args: Parameters<Commands[Name]>
  ) => Awaited<ReturnType<Commands[Name]>>;
};

type CommandArguments = Record<string, unknown>;

const BRIDGE = "__omnileafFakeInvoke";

const INSTALL_BRIDGE = `Object.defineProperty(window, "__TAURI_INTERNALS__", {
  value: { invoke: (command, args) => window.${BRIDGE}(command, args) },
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
): unknown {
  const name = bindingName(command);
  if (!isCommand(backend, name)) {
    throw new Error(`the fake backend has no command \`${command}\``);
  }
  return Reflect.apply(backend[name], undefined, Object.values(args));
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
