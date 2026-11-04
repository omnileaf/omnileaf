import type { Page, Route } from "@playwright/test";

import { expect } from "./fixtures.ts";
import { HOSTILE_TEXT, WIDE_LETTER_SPACING_EM } from "./samples.ts";

export const SESSION_API = "**/admin/api/session";
export const REPORTS_API = "**/admin/api/reports";
export const REPORT_API = "**/admin/api/reports/*";
export const MOVE_API = "**/admin/api/reports/*/status";
export const ISSUE_API = "**/admin/api/reports/*/issue";
export const LOGOUT_API = "**/admin/api/logout";
export const LOGIN_PAGE = "**/admin/login";

const STYLESHEETS = "**/_app/immutable/assets/*.css";
const CSRF_HEADER = "x-csrf-token";
const REPORT_PATH = /\/admin\/api\/reports\/[^/]+$/;

type FailureBody = Readonly<Record<string, string>>;
type Answer = Record<string, unknown>;

function isRecord(value: unknown): value is Answer {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function gate(): {
  readonly passed: Promise<undefined>;
  readonly open: () => void;
} {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return {
    passed: promise,
    open: () => {
      resolve(undefined);
    },
  };
}

export async function failOnce(
  page: Page,
  pattern: string,
  status: number,
  body: FailureBody,
): Promise<void> {
  let failed = false;
  await page.route(pattern, async (route) => {
    if (failed) {
      await route.fallback();
      return;
    }
    failed = true;
    await route.fulfill({ status, json: body });
  });
}

export async function failAlways(
  page: Page,
  pattern: string,
  status: number,
  body: FailureBody,
): Promise<void> {
  await page.route(pattern, (route) => route.fulfill({ status, json: body }));
}

export async function holdAnswers(
  page: Page,
  pattern: string,
  until: Promise<undefined>,
): Promise<void> {
  await page.route(pattern, async (route) => {
    await until;
    await route.fallback();
  });
}

async function patchAnswer(
  route: Route,
  patch: (answer: Answer) => void,
): Promise<void> {
  const response = await route.fetch();
  const answer: unknown = await response.json();
  if (isRecord(answer)) {
    patch(answer);
  }
  await route.fulfill({ response, json: answer });
}

interface MoveRequest {
  readonly body: unknown;
  readonly hasCsrfToken: boolean;
  readonly isJson: boolean;
}

interface Status {
  readonly kind: string;
  readonly issue?: number;
}

function statusOf(body: unknown): Status | undefined {
  if (!isRecord(body) || typeof body["status"] !== "string") {
    return undefined;
  }
  const issue = body["issue"];
  return typeof issue === "number"
    ? { kind: body["status"], issue }
    : { kind: body["status"] };
}

export async function succeedMoves(page: Page): Promise<MoveRequest[]> {
  const requests: MoveRequest[] = [];
  const moved = new Map<string, Status>();
  await page.route(MOVE_API, async (route) => {
    const request = route.request();
    const headers = request.headers();
    const body: unknown = request.postDataJSON();
    const status = statusOf(body);
    const code = new URL(request.url()).pathname.split("/").at(-2) ?? "";
    requests.push({
      body,
      hasCsrfToken: (headers[CSRF_HEADER] ?? "") !== "",
      isJson: (headers["content-type"] ?? "").startsWith("application/json"),
    });
    if (status !== undefined) {
      moved.set(code, status);
    }
    await route.fulfill({ status: 200, json: { result: "changed" } });
  });
  const apply = (listed: unknown): void => {
    if (isRecord(listed) && typeof listed["code"] === "string") {
      const status = moved.get(listed["code"]);
      if (status !== undefined) {
        listed["status"] = status;
      }
    }
  };
  await page.route(REPORTS_API, (route) =>
    patchAnswer(route, (answer) => {
      const reports = answer["reports"];
      for (const listed of Array.isArray(reports) ? reports : []) {
        apply(listed);
      }
    }),
  );
  await page.route(
    (url) => REPORT_PATH.test(url.pathname),
    (route) =>
      patchAnswer(route, (answer) => {
        apply(answer["listed"]);
      }),
  );
  return requests;
}

export function expectMoves(
  requests: readonly MoveRequest[],
  bodies: readonly unknown[],
): void {
  expect(requests.map(({ body }) => body)).toEqual(bodies);
  expect(
    requests.every(({ hasCsrfToken }) => hasCsrfToken),
    "every move carries the session token",
  ).toBe(true);
  expect(
    requests.every(({ isJson }) => isJson),
    "every move is sent as json",
  ).toBe(true);
}

export async function showReportText(
  page: Page,
  text: string = HOSTILE_TEXT,
): Promise<void> {
  await page.route(
    (url) => REPORT_PATH.test(url.pathname),
    (route) =>
      patchAnswer(route, (answer) => {
        answer["report"] = text;
      }),
  );
  await page.route(ISSUE_API, (route) =>
    patchAnswer(route, (answer) => {
      answer["body"] = text;
    }),
  );
}

export async function stubSignInPage(page: Page): Promise<void> {
  await page.route(LOGIN_PAGE, (route) =>
    route.fulfill({ status: 200, body: "sign in" }),
  );
}

export async function widenText(page: Page): Promise<void> {
  await page.route(STYLESHEETS, async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["content-length"];
    await route.fulfill({
      status: response.status(),
      headers,
      body: `${await response.text()}\n*, *::before, *::after { letter-spacing: ${String(WIDE_LETTER_SPACING_EM)}em !important; }`,
    });
  });
}
