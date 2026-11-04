import { afterEach, expect, test, vi } from "vitest";

import { api } from "#lib/browser-api.ts";
import { API_ROOT, LOGIN_PATH } from "#lib/paths.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("asks the browser's fetch for the reports", async () => {
  const fetch = vi.fn(() =>
    Promise.resolve(new Response('{"reports":[],"truncated":false}')),
  );
  vi.stubGlobal("fetch", fetch);

  const result = await api.reports();

  expect(result).toEqual({
    ok: true,
    value: { reports: [], truncated: false },
  });
  expect(fetch).toHaveBeenCalledWith(
    `${API_ROOT}/reports`,
    expect.objectContaining({ method: "GET" }),
  );
});

test("sends the browser to the sign-in page when the session is gone", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });
  vi.stubGlobal("fetch", () =>
    Promise.resolve(new Response('{"error":"signedOut"}', { status: 401 })),
  );

  await api.reports();

  expect(assign).toHaveBeenCalledExactlyOnceWith(LOGIN_PATH);
});
