import type { APIResponse, Page, Response } from "@playwright/test";

import { heading } from "./checks.ts";
import { expect, isWebkit } from "./fixtures.ts";

const REVIEWER = "reviewer";
const SESSION_COOKIE_PATH = "/admin";
const CLEARED_COOKIE = /Max-Age=0/i;

/** WebKit never stores a `Secure` cookie that arrives over plain HTTP, even from loopback, so the cookies of a sign-in are kept by hand. */
async function keepCookies(page: Page, answer: APIResponse): Promise<void> {
  const { hostname } = new URL(answer.url());
  const cookies = answer
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .filter(({ value }) => !CLEARED_COOKIE.test(value))
    .map(({ value }) => {
      const [pair = ""] = value.split(";");
      const [name = "", ...rest] = pair.split("=");
      return {
        name,
        value: rest.join("="),
        domain: hostname,
        path: SESSION_COOKIE_PATH,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      };
    });
  await page.context().addCookies(cookies);
}

export async function signInAs(
  page: Page,
  login: string,
): Promise<Response | null> {
  const started = await page.request.get("/admin/login", { maxRedirects: 0 });
  const target = new URL(started.headers()["location"] ?? "");
  const state = target.searchParams.get("state") ?? "";
  const callback = `/admin/auth/callback?code=code-for-${login}&state=${state}`;
  if (!isWebkit(page)) {
    return page.goto(callback);
  }
  await keepCookies(page, started);
  const answer = await page.request.get(callback, { maxRedirects: 0 });
  await keepCookies(page, answer);
  return page.goto(answer.status() === 303 ? "/admin/health" : callback);
}

export async function openSignedIn(page: Page, path: string): Promise<void> {
  const signedIn = await signInAs(page, REVIEWER);
  expect(signedIn?.status(), "sign-in").toBe(200);
  await page.goto(path);
  await expect(heading(page)).toBeVisible();
}
