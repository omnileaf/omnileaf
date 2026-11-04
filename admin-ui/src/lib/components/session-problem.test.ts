import { expect, test } from "vitest";

import type { ApiError } from "#lib/api.ts";
import { html, renderPage, tokensOf } from "#lib/components/ui/render.ts";
import { copy } from "#lib/copy.ts";

import SessionProblem from "./session-problem.svelte";

function markupOf(error: ApiError): string {
  return html(SessionProblem, { error, onRetry: () => undefined }).replace(
    /<!--.*?-->/gs,
    "",
  );
}

function headOf(error: ApiError): string {
  return renderPage(SessionProblem, { error, onRetry: () => undefined }).head;
}

test("titles a signed out visitor's page and tells them they are being taken to sign in", () => {
  const markup = markupOf({ kind: "signedOut" });

  expect(markup).toMatch(/<h1\b[^>]*>\s*Signing in\s*<\/h1>/);
  expect(markup).toMatch(/role="status"/);
  expect(markup).toContain(copy.shell.signingInHint);
  expect(headOf({ kind: "signedOut" })).toContain(
    "<title>Signing in · Omnileaf admin</title>",
  );
});

test("offers no retry while redirecting to sign in", () => {
  const markup = markupOf({ kind: "signedOut" });

  expect(markup).not.toContain("<button");
  expect(markup).not.toContain('role="alert"');
});

test("names the failure in a heading and the reason in an alert when the session cannot open", () => {
  const markup = markupOf({ kind: "relayUnavailable" });

  expect(markup).toMatch(/<h1\b[^>]*>\s*Could not open your session\s*<\/h1>/);
  expect(markup).toMatch(/role="alert"/);
  expect(markup).toContain(copy.errors.relayUnavailable);
  expect(headOf({ kind: "relayUnavailable" })).toContain(
    "<title>Could not open your session · Omnileaf admin</title>",
  );
});

test("offers a try again button as tall as the other controls", () => {
  const markup = markupOf({ kind: "relayUnavailable" });
  const button = /<button\b[^>]*>/.exec(markup)?.[0] ?? "";

  expect(markup).toMatch(/<button\b[^>]*>\s*Try again\s*<\/button>/);
  expect(tokensOf(button, /<button\b[^>]*>/)).toEqual(
    expect.arrayContaining(["block-11", "tablet:block-9"]),
  );
});

test("keeps the page in a main landmark", () => {
  expect(markupOf({ kind: "timeout" })).toMatch(/<main\b[\s\S]*<\/main>/);
});

test("never emits an inline style", () => {
  expect(markupOf({ kind: "timeout" })).not.toMatch(/\sstyle=/);
});
