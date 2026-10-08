import type { CrashReporting } from "#lib/crash-report/crash-reporting.svelte.ts";
import type { commands, IpcError } from "#lib/ipc/bindings.ts";

export type CrashTestBackend = Pick<
  typeof commands,
  "panicInCore" | "crashAndQuit"
>;

/** Lets an error escape every handler, as a bug in the interface would. */
export type ThrowUnhandled = (error: Error) => void;

export class InterfaceErrorTest extends Error {
  override readonly name = "InterfaceErrorTest";
}

export class CrashTestRefused extends Error {
  override readonly name = "CrashTestRefused";
}

const INTERFACE_ERROR_MESSAGE =
  "a crash test in Settings › Advanced threw on purpose";

function refused(test: string, error: IpcError): CrashTestRefused {
  return new CrashTestRefused(`${test}: ${error.message}`);
}

const throwOnNextTask: ThrowUnhandled = (error) => {
  setTimeout(() => {
    throw error;
  });
};

/** The crash tests a development build offers, each ending in the report a person would be offered. */
export class CrashTests {
  constructor(
    private readonly backend: CrashTestBackend,
    private readonly reporting: Pick<CrashReporting, "offerSaved">,
    private readonly throwUnhandled: ThrowUnhandled = throwOnNextTask,
  ) {}

  async panicInCore(): Promise<void> {
    const panicked = await this.backend.panicInCore();
    if (panicked.status === "error") {
      throw refused("panic in the core", panicked.error);
    }
    await this.reporting.offerSaved();
  }

  throwInterfaceError(): void {
    this.throwUnhandled(new InterfaceErrorTest(INTERFACE_ERROR_MESSAGE));
  }

  async crashAndQuit(): Promise<void> {
    const crashed = await this.backend.crashAndQuit();
    if (crashed.status === "error") {
      throw refused("crash and quit", crashed.error);
    }
  }
}
