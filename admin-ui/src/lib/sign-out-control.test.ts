import { expect, test, vi } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { SignOutControl } from "#lib/sign-out-control.svelte.ts";

const CSRF = "csrf-token";
const OK: ApiResult<null> = { ok: true, value: null };
const REFUSED: ApiResult<null> = { ok: false, error: { kind: "csrfRejected" } };

function pendingLogout() {
  let settle: (result: ApiResult<null>) => void = () => undefined;
  const logout = vi.fn(
    () =>
      new Promise<ApiResult<null>>((resolve) => {
        settle = resolve;
      }),
  );
  return {
    logout,
    settle: (result: ApiResult<null>) => {
      settle(result);
    },
  };
}

test("starts idle", () => {
  const control = new SignOutControl({ logout: vi.fn() }, vi.fn());

  expect(control.state).toEqual({ kind: "idle" });
});

test("is pending while the service answers and sends one request for two clicks", async () => {
  const { logout, settle } = pendingLogout();
  const control = new SignOutControl({ logout }, vi.fn());

  const first = control.run(CSRF);
  const second = control.run(CSRF);
  expect(control.state).toEqual({ kind: "pending" });
  settle(OK);
  await Promise.all([first, second]);

  expect(logout).toHaveBeenCalledTimes(1);
  expect(logout).toHaveBeenCalledWith(CSRF);
});

test("goes to the sign-in page and stays pending once signed out", async () => {
  const goToSignIn = vi.fn();
  const control = new SignOutControl(
    { logout: () => Promise.resolve(OK) },
    goToSignIn,
  );

  await control.run(CSRF);

  expect(goToSignIn).toHaveBeenCalledOnce();
  expect(control.state).toEqual({ kind: "pending" });
});

test("fails with a message and allows another try", async () => {
  const logout = vi
    .fn<(csrf: string) => Promise<ApiResult<null>>>()
    .mockResolvedValueOnce(REFUSED)
    .mockResolvedValueOnce(OK);
  const control = new SignOutControl({ logout }, vi.fn());

  await control.run(CSRF);
  expect(control.state).toEqual({
    kind: "failed",
    message: copy.errors.csrfRejected,
  });
  await control.run(CSRF);

  expect(logout).toHaveBeenCalledTimes(2);
  expect(control.state).toEqual({ kind: "pending" });
});

test("forgets a failure when told to", async () => {
  const control = new SignOutControl(
    { logout: () => Promise.resolve(REFUSED) },
    vi.fn(),
  );
  await control.run(CSRF);

  control.clear();

  expect(control.state).toEqual({ kind: "idle" });
});

test("does not cancel a sign out that is in flight when told to clear", async () => {
  const { logout, settle } = pendingLogout();
  const control = new SignOutControl({ logout }, vi.fn());
  const running = control.run(CSRF);

  control.clear();

  expect(control.state).toEqual({ kind: "pending" });
  settle(OK);
  await running;
});
