import { expect, test } from "vitest";

import { appLockSummary, NEW_APP_LOCK } from "./app-lock.ts";

test("says the app lock is off", () => {
  expect(appLockSummary(NEW_APP_LOCK)).toBe("Off");
});

test("names what unlocks it and the delay once it is on", () => {
  const summary = appLockSummary({
    ...NEW_APP_LOCK,
    isOn: true,
    lockAfter: "fiveMinutes",
  });

  expect(summary).toBe("Fingerprint, face or screen lock · after 5 minutes");
});

test("says it locks immediately when there is no delay", () => {
  const summary = appLockSummary({
    ...NEW_APP_LOCK,
    isOn: true,
    lockAfter: "immediately",
  });

  expect(summary).toBe("Fingerprint, face or screen lock · immediately");
});
