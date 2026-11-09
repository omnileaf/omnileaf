import { beforeEach, expect, test, vi } from "vitest";

import { renderPage } from "#lib/components/ui/render.ts";

import ErrorRoute from "./+error.svelte";

const address = vi.hoisted((): { status: number } => ({ status: 404 }));

vi.mock("$app/state", () => ({ page: address }));

beforeEach(() => {
  address.status = 404;
});

function body(): string {
  return renderPage(ErrorRoute, {}).body.replace(/<!--.*?-->/gs, "");
}

test("shows the not found page for an unknown address", () => {
  expect(body()).toMatch(/<h1\b[^>]*>\s*Page not found\s*<\/h1>/);
});

test("shows the something went wrong page for a failure", () => {
  address.status = 500;

  expect(body()).toMatch(/<h1\b[^>]*>\s*Something went wrong\s*<\/h1>/);
});
