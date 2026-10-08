import { expect, test } from "vitest";

import type {
  CrashReportOffer,
  IpcError,
  IpcErrorCode,
} from "$lib/ipc/bindings";

import { type CrashReportChoice, CrashReportSetting } from "./choice.svelte";
import {
  type CrashReportBackend,
  CrashReporting,
} from "./crash-reporting.svelte";
import { describeInterfaceError } from "./interface-errors";

const SAVED_DETAILS = "Omnileaf 1.2.3 on Linux\nPanic: boom\n";
const INTERFACE_DETAILS = "Omnileaf 1.2.3 on Linux\nInterface error: oops\n";
const CHOICE_KEY = "omnileaf.crash-reports";
const SAVED_PANIC: CrashReportOffer = {
  details: SAVED_DETAILS,
  origin: "panic",
};
const INTERFACE_ERROR: CrashReportOffer = {
  details: INTERFACE_DETAILS,
  origin: "interface",
};

type Result<T> =
  { status: "ok"; data: T } | { status: "error"; error: IpcError };

function ok<T>(data: T): Result<T> {
  return { status: "ok", data };
}

function failed(code: IpcErrorCode): Result<null> {
  return { status: "error", error: { code, message: "from the backend" } };
}

interface FakeOptions {
  readonly saved?: CrashReportOffer | null;
  readonly sending?: Result<null>;
  readonly reporterFails?: boolean;
}

function fakeBackend({
  saved = SAVED_PANIC,
  sending = ok(null),
  reporterFails = false,
}: FakeOptions = {}) {
  const calls = { sent: 0, declined: 0, interfaceErrors: [] as string[] };
  let offered: CrashReportOffer | null = null;
  const backend: CrashReportBackend = {
    offerSavedCrashReport: () => {
      offered ??= saved;
      return Promise.resolve(ok(offered));
    },
    offerInterfaceErrorReport: (error) => {
      calls.interfaceErrors.push(error.message);
      if (reporterFails) {
        return Promise.reject(new TypeError("no backend to call"));
      }
      offered ??= INTERFACE_ERROR;
      return Promise.resolve(ok(offered));
    },
    sendCrashReport: () => {
      calls.sent += 1;
      if (sending.status === "ok") {
        offered = null;
      }
      return Promise.resolve(sending);
    },
    copyCrashReport: () => Promise.resolve(ok(null)),
    declineCrashReport: () => {
      calls.declined += 1;
      offered = null;
      return Promise.resolve(ok(null));
    },
  };
  return { backend, calls };
}

function settingOf(choice: CrashReportChoice): CrashReportSetting {
  const values = new Map<string, string>([[CHOICE_KEY, choice]]);
  return new CrashReportSetting({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  });
}

function reportingWith(choice: CrashReportChoice, options: FakeOptions = {}) {
  const { backend, calls } = fakeBackend(options);
  const setting = settingOf(choice);
  return { reporting: new CrashReporting(backend, setting), setting, calls };
}

test("shows the report a crash left behind, asking first", async () => {
  const { reporting, calls } = reportingWith("ask");

  await reporting.offerSaved();

  expect(reporting.prompt).toEqual({
    kind: "asking",
    details: SAVED_DETAILS,
    origin: "panic",
    failure: undefined,
  });
  expect(calls.sent).toBe(0);
});

test("words an interface error left by an earlier run as an interface error", async () => {
  const { reporting } = reportingWith("ask", { saved: INTERFACE_ERROR });

  await reporting.offerSaved();

  expect(reporting.prompt).toMatchObject({
    details: INTERFACE_DETAILS,
    origin: "interface",
  });
});

test("shows nothing when no crash left a report", async () => {
  const { reporting } = reportingWith("ask", { saved: null });

  await reporting.offerSaved();

  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("declining sends nothing and puts the report away", async () => {
  const { reporting, calls } = reportingWith("ask");
  await reporting.offerSaved();

  await reporting.decline();

  expect(reporting.prompt).toEqual({ kind: "hidden" });
  expect(calls.declined).toBe(1);
  expect(calls.sent).toBe(0);
});

test("declining leaves the choice as it was", async () => {
  const { reporting, setting } = reportingWith("ask");
  await reporting.offerSaved();

  await reporting.decline();

  expect(setting.choice).toBe("ask");
});

test("sends the report shown and puts it away", async () => {
  const { reporting, setting, calls } = reportingWith("ask");
  await reporting.offerSaved();

  await reporting.sendThisTime();

  expect(calls.sent).toBe(1);
  expect(reporting.prompt).toEqual({ kind: "hidden" });
  expect(setting.choice).toBe("ask");
});

test("sends once when Send is pressed again before the browser opens", async () => {
  const { reporting, calls } = reportingWith("ask");
  await reporting.offerSaved();

  await Promise.all([reporting.sendThisTime(), reporting.sendAlways()]);

  expect(calls.sent).toBe(1);
});

test("sending with Always ticked sends later reports without asking", async () => {
  const { reporting, setting, calls } = reportingWith("ask");
  await reporting.offerSaved();

  await reporting.sendAlways();

  expect(calls.sent).toBe(1);
  expect(setting.choice).toBe("always");
});

test("keeps asking and says why when the browser can't open", async () => {
  const { reporting, setting } = reportingWith("ask", {
    sending: failed("browserUnavailable"),
  });
  await reporting.offerSaved();

  await reporting.sendAlways();

  expect(reporting.prompt).toMatchObject({
    kind: "asking",
    failure: "browserUnavailable",
  });
  expect(setting.choice).toBe("ask");
});

test("says the report wasn't sent when sending fails another way", async () => {
  const { reporting } = reportingWith("ask", {
    sending: failed("crashReportUnavailable"),
  });
  await reporting.offerSaved();

  await reporting.sendThisTime();

  expect(reporting.prompt).toMatchObject({
    kind: "asking",
    failure: "notSent",
  });
});

test("Always sends without asking", async () => {
  const { reporting, calls } = reportingWith("always");

  await reporting.offerSaved();

  expect(calls.sent).toBe(1);
  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("Always asks after all when the browser can't open", async () => {
  const { reporting } = reportingWith("always", {
    sending: failed("browserUnavailable"),
  });

  await reporting.offerSaved();

  expect(reporting.prompt).toMatchObject({
    kind: "asking",
    details: SAVED_DETAILS,
    failure: "browserUnavailable",
  });
});

test("Never sends nothing, shows nothing and puts the report away", async () => {
  const { reporting, calls } = reportingWith("never");

  await reporting.offerSaved();

  expect(calls.sent).toBe(0);
  expect(calls.declined).toBe(1);
  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("offers an error the interface didn't handle straight away", async () => {
  const { reporting, calls } = reportingWith("ask", { saved: null });

  await reporting.offerInterfaceError({ message: "oops", stack: null });

  expect(calls.interfaceErrors).toEqual(["oops"]);
  expect(reporting.prompt).toEqual({
    kind: "asking",
    details: INTERFACE_DETAILS,
    origin: "interface",
    failure: undefined,
  });
});

test("keeps showing the report it asked about when another error arrives", async () => {
  const { reporting, calls } = reportingWith("ask");
  await reporting.offerSaved();

  await reporting.offerInterfaceError({ message: "oops", stack: null });

  expect(calls.interfaceErrors).toEqual(["oops"]);
  expect(reporting.prompt).toMatchObject({
    details: SAVED_DETAILS,
    origin: "panic",
  });
});

test("Always sends an interface error once however often it happens", async () => {
  const { reporting, calls } = reportingWith("always", { saved: null });

  await reporting.offerInterfaceError({ message: "oops", stack: null });
  await reporting.offerInterfaceError({ message: "oops", stack: null });
  await reporting.offerInterfaceError({ message: "oops", stack: null });

  expect(calls.sent).toBe(1);
  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("Always sends once when two errors arrive together", async () => {
  const { reporting, calls } = reportingWith("always", { saved: null });

  await Promise.all([
    reporting.offerInterfaceError({ message: "oops", stack: null }),
    reporting.offerInterfaceError({ message: "again", stack: null }),
  ]);

  expect(calls.sent).toBe(1);
  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("Always sends once when a saved report and an error arrive together", async () => {
  const { reporting, calls } = reportingWith("always");

  await Promise.all([
    reporting.offerSaved(),
    reporting.offerInterfaceError({ message: "oops", stack: null }),
  ]);

  expect(calls.sent).toBe(1);
  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("doesn't ask again about interface errors once one was declined", async () => {
  const { reporting, calls } = reportingWith("ask", { saved: null });
  await reporting.offerInterfaceError({ message: "oops", stack: null });
  await reporting.decline();

  await reporting.offerInterfaceError({ message: "oops", stack: null });

  expect(reporting.prompt).toEqual({ kind: "hidden" });
  expect(calls.interfaceErrors).toEqual(["oops"]);
});

test("still asks about an interface error after declining a saved report", async () => {
  const { reporting } = reportingWith("ask");
  await reporting.offerSaved();
  await reporting.decline();

  await reporting.offerInterfaceError({ message: "oops", stack: null });

  expect(reporting.prompt).toMatchObject({
    kind: "asking",
    origin: "interface",
  });
});

test("a report no longer waiting is not called unsent", async () => {
  const { reporting } = reportingWith("ask", {
    sending: failed("noCrashReport"),
  });
  await reporting.offerSaved();

  await reporting.sendThisTime();

  expect(reporting.prompt).toEqual({ kind: "hidden" });
});

test("a reporter that fails doesn't report its own failure over and over", async () => {
  const { reporting, calls } = reportingWith("ask", {
    saved: null,
    reporterFails: true,
  });
  const rounds = 5;

  let pending = reporting.offerInterfaceError({ message: "oops", stack: null });
  for (let round = 0; round < rounds; round += 1) {
    try {
      await pending;
      break;
    } catch (error: unknown) {
      pending = reporting.offerInterfaceError(describeInterfaceError(error));
    }
  }

  expect(calls.interfaceErrors).toEqual(["oops"]);
});
