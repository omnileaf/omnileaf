import { expect, test } from "vitest";

import { failureMessage } from "./share-failure";

test("says Send to Omnileaf is coming soon while reports have nowhere to go", () => {
  const message = failureMessage({ way: "send", code: "reportsNotSent" });

  expect(message).toBe("Send to Omnileaf · coming soon");
});

test("says the report couldn't be sent when sending fails", () => {
  const message = failureMessage({ way: "send", code: "internal" });

  expect(message).toBe("Couldn't send the report. Try again.");
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
