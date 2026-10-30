import { expect, test } from "vitest";

import { failureMessage } from "./share-failure";

test("says why the report couldn't be sent", () => {
  const messages = (
    [
      "relayUnreachable",
      "relayRateLimited",
      "relayBusy",
      "replyAddressInvalid",
      "reportRefused",
      "internal",
    ] as const
  ).map((code) => failureMessage({ way: "send", code }));

  expect(messages).toEqual([
    "Couldn't reach Omnileaf. Check your connection and try again.",
    "Too many reports from this network. Try again in an hour.",
    "Omnileaf can't take more reports right now. Try again later.",
    "Enter a whole email address, or leave it empty.",
    "Couldn't send the report. Try again.",
    "Couldn't send the report. Try again.",
  ]);
});

test("says what each other way couldn't do", () => {
  const messages = (["github", "copy", "save"] as const).map((way) =>
    failureMessage({ way, code: "internal" }),
  );

  expect(messages).toEqual([
    "Couldn't open your browser. Try again.",
    "Couldn't copy the report. Try again.",
    "Couldn't save the report. Try again.",
  ]);
});
