import { expect, test, vi } from "vitest";

import type { ApiResult } from "#lib/api.ts";
import { copy } from "#lib/copy.ts";
import { signOut } from "#lib/sign-out.ts";

const CSRF = "csrf-token";

function logoutAnswering(result: ApiResult<null>) {
  return vi.fn<(csrf: string) => Promise<ApiResult<null>>>(() =>
    Promise.resolve(result),
  );
}

test("sends the csrf token and then goes to the sign-in page", async () => {
  const logout = logoutAnswering({ ok: true, value: null });
  const goToSignIn = vi.fn();

  const problem = await signOut({ logout }, CSRF, goToSignIn);

  expect(logout).toHaveBeenCalledWith(CSRF);
  expect(goToSignIn).toHaveBeenCalledOnce();
  expect(problem).toBeUndefined();
});

test("stays put and says why when the service refuses to sign out", async () => {
  const logout = logoutAnswering({
    ok: false,
    error: { kind: "csrfRejected" },
  });
  const goToSignIn = vi.fn();

  const problem = await signOut({ logout }, CSRF, goToSignIn);

  expect(goToSignIn).not.toHaveBeenCalled();
  expect(problem).toBe(copy.errors.csrfRejected);
});
