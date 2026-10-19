import type { Channel } from "@tauri-apps/api/core";

import type { commands, IpcError } from "./bindings.ts";

type Commands = typeof commands;

type Success<Result> = Extract<Result, { status: "ok"; data: unknown }>;

type Outcome<Result> = [Success<Result>] extends [never]
  ? Result
  : Success<Result>["data"];

export interface FakeChannel<Message> {
  send(message: Message): Promise<void>;
}

/** A value as it crosses IPC: ids as plain strings and channels as something to send on. */
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

/** Answers every command the core offers, as a stand-in for the core in tests and the sample library. */
export type FakeBackend = {
  [Name in keyof Commands]: (
    ...args: Wire<Parameters<Commands[Name]>>
  ) => Answer<Name> | Promise<Answer<Name>>;
};

export class CommandFailure extends Error {
  constructor(readonly error: IpcError) {
    super(error.message);
  }
}

export function bindingName(command: string): string {
  return command.replace(/_([a-z0-9])/g, (_, next: string) =>
    next.toUpperCase(),
  );
}

export function isCommand(
  backend: Partial<FakeBackend>,
  name: string,
): name is keyof FakeBackend {
  return Object.hasOwn(backend, name);
}
