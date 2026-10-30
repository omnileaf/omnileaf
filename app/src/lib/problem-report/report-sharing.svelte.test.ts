import { expect, test } from "vitest";

import type { IpcError, SentProblemReport } from "#lib/ipc/bindings.ts";
import type { LocalDay } from "#lib/history/local-date.ts";

import {
  ReportSharing,
  type ShareBackend,
  type Shared,
} from "./report-sharing.svelte";

const TODAY: LocalDay = 20_742;

const SENT: SentProblemReport = {
  code: "R-7K2M-QX9D",
  statusKey: "c3RhdHVz",
};

type Sending =
  | { status: "ok"; data: SentProblemReport }
  | { status: "error"; error: IpcError };

function sharingWith(sending: Sending = { status: "ok", data: SENT }) {
  const sentTo: (string | null)[] = [];
  const shared: Shared[] = [];
  const unused = () => Promise.reject(new Error("not this way"));
  const backend: ShareBackend = {
    sendProblemReport: (replyTo) => {
      sentTo.push(replyTo);
      return Promise.resolve(sending);
    },
    copyProblemReport: unused,
    openProblemReportIssue: unused,
    saveProblemReport: unused,
  };
  const sharing = new ReportSharing(
    backend,
    () => TODAY,
    (way) => {
      shared.push(way);
    },
  );
  return { sharing, sentTo, shared };
}

test("sends the report with the address typed for a reply", async () => {
  const { sharing, sentTo, shared } = sharingWith();
  sharing.replyTo = "  reader@example.org ";

  await sharing.share("send");

  expect([sentTo, shared]).toEqual([
    ["reader@example.org"],
    [{ way: "send", sent: SENT }],
  ]);
});

test("sends no address when none is typed", async () => {
  const { sharing, sentTo } = sharingWith();
  sharing.replyTo = "   ";

  await sharing.share("send");

  expect(sentTo).toEqual([null]);
});

test("says why sending failed and keeps it from counting as sent", async () => {
  const { sharing, shared } = sharingWith({
    status: "error",
    error: {
      code: "relayRateLimited",
      message: "too many reports were sent from this network",
    },
  });

  await sharing.share("send");

  expect([sharing.failure, shared]).toEqual([
    { way: "send", code: "relayRateLimited" },
    [],
  ]);
});
