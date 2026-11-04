import { expect, test, vi } from "vitest";

import { createApi, type ApiResult } from "#lib/api.ts";
import { API_ROOT } from "#lib/paths.ts";
import { aCode, fixtureText } from "#lib/testing.ts";

const CSRF = "csrf-token";
const TINY_TIMEOUT_MS = 5;
const DEFAULT_TIMEOUT_MS = 15_000;

type Outcome = Response | Error | ((signal: AbortSignal) => Promise<Response>);

interface Sent {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function answer(outcome: Outcome, signal: AbortSignal): Promise<Response> {
  if (outcome instanceof Error) {
    return Promise.reject(outcome);
  }
  return typeof outcome === "function"
    ? outcome(signal)
    : Promise.resolve(outcome);
}

function harness(outcome: Outcome, timeoutMs?: number) {
  const sent: Sent[] = [];
  let signedOut = 0;
  const api = createApi({
    fetch: (input, init) => {
      sent.push({ url: urlOf(input), init });
      return answer(outcome, init?.signal ?? new AbortController().signal);
    },
    onSignedOut: () => {
      signedOut += 1;
    },
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { api, sent, signedOut: () => signedOut };
}

function json(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function neverAnswers(signal: AbortSignal): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      reject(new Error("aborted", { cause: signal.reason }));
    });
  });
}

function stallsReadingTheBody(signal: AbortSignal): Promise<Response> {
  const body = new ReadableStream({
    start(controller) {
      signal.addEventListener("abort", () => {
        controller.error(new Error("aborted", { cause: signal.reason }));
      });
    },
  });
  return Promise.resolve(new Response(body, { status: 200 }));
}

function valueOf<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new Error(`expected a value, got ${result.error.kind}`);
  }
  return result.value;
}

test("reads the signed-in login and csrf token", async () => {
  const { api, sent } = harness(json(200, '{"login":"alice","csrf":"abc"}'));

  const result = await api.session();

  expect(valueOf(result)).toEqual({ login: "alice", csrf: "abc" });
  expect(sent[0]?.url).toBe(`${API_ROOT}/session`);
  expect(sent[0]?.init?.method).toBe("GET");
});

test("reads the report list", async () => {
  const { api, sent } = harness(json(200, fixtureText("reports.json")));

  const list = valueOf(await api.reports());

  expect(sent[0]?.url).toBe(`${API_ROOT}/reports`);
  expect(list.reports).toHaveLength(3);
});

test("reads one report", async () => {
  const { api, sent } = harness(json(200, fixtureText("report.json")));

  const detail = valueOf(await api.report(aCode()));

  expect(sent[0]?.url).toBe(`${API_ROOT}/reports/R-2222-2222`);
  expect(detail.report).toBe("Full text of R-2222-2222");
});

test("reads the issue text of a report", async () => {
  const { api, sent } = harness(json(200, fixtureText("issue.json")));

  const issue = valueOf(await api.issue(aCode()));

  expect(sent[0]?.url).toBe(`${API_ROOT}/reports/R-2222-2222/issue`);
  expect(issue.result).toBe("ready");
});

test("posts a move with the csrf token and the issue number", async () => {
  const { api, sent } = harness(json(200, '{"result":"changed"}'));

  const result = await api.move(
    aCode(),
    { status: "published", issue: 42 },
    CSRF,
  );

  expect(result).toEqual({ ok: true, value: null });
  expect(sent[0]?.url).toBe(`${API_ROOT}/reports/R-2222-2222/status`);
  expect(sent[0]?.init?.method).toBe("POST");
  expect(new Headers(sent[0]?.init?.headers).get("x-csrf-token")).toBe(CSRF);
  expect(sent[0]?.init?.body).toBe('{"status":"published","issue":42}');
});

test("signs out with the csrf token", async () => {
  const { api, sent } = harness(new Response(null, { status: 204 }));

  const result = await api.logout(CSRF);

  expect(result).toEqual({ ok: true, value: null });
  expect(sent[0]?.url).toBe(`${API_ROOT}/logout`);
  expect(sent[0]?.init?.method).toBe("POST");
  expect(new Headers(sent[0]?.init?.headers).get("x-csrf-token")).toBe(CSRF);
});

test.each([
  ["an html body", new Response("<html>", { status: 200 })],
  ["a json body", json(200, "{}")],
  ["an empty body", new Response(null, { status: 200 })],
])("does not take a 200 with %s for a sign out", async (_name, response) => {
  const { api } = harness(response);

  const result = await api.logout(CSRF);

  expect(result).toEqual({ ok: false, error: { kind: "unexpectedReply" } });
});

test("gives every request fifteen seconds unless told otherwise", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const { api } = harness(json(200, '{"login":"alice","csrf":"abc"}'));

  await api.session();

  expect(timeout).toHaveBeenCalledExactlyOnceWith(DEFAULT_TIMEOUT_MS);
  timeout.mockRestore();
});

test("attaches a timeout signal to every request", async () => {
  const { api, sent } = harness(json(200, "{}"));

  await api.session();
  await api.reports();
  await api.report(aCode());
  await api.issue(aCode());
  await api.move(aCode(), { status: "closed" }, CSRF);
  await api.logout(CSRF);

  expect(sent).toHaveLength(6);
  for (const { init } of sent) {
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
});

test.each([
  [401, "signedOut", {}],
  [403, "csrfRejected", {}],
  [404, "notFound", {}],
  [405, "methodNotAllowed", {}],
  [400, "badRequest", {}],
  [400, "issueRequired", {}],
  [409, "refused", { from: "closed" }],
  [502, "relayUnavailable", {}],
] as const)("tells a %i answer apart as %s", async (status, kind, extra) => {
  const { api } = harness(
    json(status, JSON.stringify({ error: kind, ...extra })),
  );

  const result = await api.reports();

  expect(result).toEqual({ ok: false, error: { kind, ...extra } });
});

test("sends the browser away on every call that finds the session gone", async () => {
  const { api, signedOut } = harness(json(401, '{"error":"signedOut"}'));

  await api.reports();
  await api.session();

  expect(signedOut()).toBe(2);
});

test("does not send the browser away for other failures", async () => {
  const { api, signedOut } = harness(json(404, '{"error":"notFound"}'));

  await api.reports();

  expect(signedOut()).toBe(0);
});

test.each([
  [502, "relayUnavailable"],
  [503, "relayUnavailable"],
  [504, "relayUnavailable"],
  [401, "signedOut"],
] as const)(
  "reads a %i answer without a json body as %s",
  async (status, kind) => {
    const { api } = harness(new Response("<html>", { status }));

    const result = await api.reports();

    expect(result).toEqual({ ok: false, error: { kind } });
  },
);

test("sends the browser away when a 401 has no json body", async () => {
  const { api, signedOut } = harness(new Response("<html>", { status: 401 }));

  await api.reports();

  expect(signedOut()).toBe(1);
});

test.each([
  ["a 500 without a json body", new Response("oops", { status: 500 })],
  ["a 500 with an error it does not know", json(500, '{"error":"boom"}')],
  ["a 404 without a json body", new Response("", { status: 404 })],
])(
  "reports an unexpected reply for the failed answer: %s",
  async (_name, response) => {
    const { api } = harness(response);

    const result = await api.reports();

    expect(result).toEqual({ ok: false, error: { kind: "unexpectedReply" } });
  },
);

test.each([
  ["a body that is not json", json(200, "<html>")],
  ["a list without its reports", json(200, '{"truncated":false}')],
  ["an empty answer", new Response(null, { status: 200 })],
])(
  "reports an unexpected reply for the 200 answer: %s",
  async (_name, response) => {
    const { api } = harness(response);

    const result = await api.reports();

    expect(result).toEqual({ ok: false, error: { kind: "unexpectedReply" } });
  },
);

test("reports a network failure", async () => {
  const { api } = harness(new TypeError("Failed to fetch"));

  const result = await api.reports();

  expect(result).toEqual({ ok: false, error: { kind: "networkFailure" } });
});

test("reports a timeout when the server never answers", async () => {
  const { api } = harness(neverAnswers, TINY_TIMEOUT_MS);

  const result = await api.reports();

  expect(result).toEqual({ ok: false, error: { kind: "timeout" } });
});

test("reports a timeout when the body never finishes", async () => {
  const { api } = harness(stallsReadingTheBody, TINY_TIMEOUT_MS);

  const result = await api.reports();

  expect(result).toEqual({ ok: false, error: { kind: "timeout" } });
});
