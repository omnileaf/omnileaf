import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { ProjectLink } from "#lib/ipc/bindings.ts";

import AboutFailures from "./AboutFailures.svelte";
import { LinkOpening, type OpenProjectLink } from "./link-opening.svelte";
import ProjectLinkRows from "./ProjectLinkRows.svelte";
import { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";

type OpenResult = Awaited<ReturnType<OpenProjectLink>>;

const OPENED: OpenResult = { status: "ok", data: null };
const NO_BROWSER: OpenResult = {
  status: "error",
  error: { code: "browserUnavailable", message: "from the backend" },
};
const SOURCE_CODE = "repo.example.org/omnileaf";

async function renderWith(...results: (OpenResult | Promise<OpenResult>)[]) {
  const opened: ProjectLink[] = [];
  const opening = new LinkOpening((link) => {
    opened.push(link);
    const result = results.shift();
    if (result === undefined) {
      throw new Error("opened more links than the test expects");
    }
    return Promise.resolve(result);
  });
  const copying = new DetailsCopying(() => Promise.resolve(OPENED));
  await render(ProjectLinkRows, {
    opening,
    sourceCode: SOURCE_CODE,
    look: "phone",
  });
  await render(AboutFailures, { copying, opening });
  return {
    opened,
    sourceCode: page.getByRole("button", { name: /^Source code/ }),
    alert: page.getByRole("alert"),
  };
}

test("shows where the source code lives", async () => {
  const { sourceCode } = await renderWith();

  await expect
    .element(sourceCode.getByText(SOURCE_CODE, { exact: true }))
    .toBeVisible();
});

test("says the source code opens in the browser", async () => {
  const { sourceCode } = await renderWith();

  await expect
    .element(sourceCode)
    .toHaveAccessibleName(`Source code ${SOURCE_CODE} Opens in your browser`);
});

test("opens the source code through the backend", async () => {
  const { sourceCode, opened } = await renderWith(OPENED);

  await sourceCode.click();

  await expect.poll(() => opened).toEqual(["sourceCode"]);
});

test("says the browser could not be opened", async () => {
  const { sourceCode, alert } = await renderWith(NO_BROWSER);

  await sourceCode.click();

  await expect
    .element(alert)
    .toHaveTextContent("Couldn't open your browser. Try again.");
});

test("clears the failure once a later link opens", async () => {
  const { sourceCode, alert } = await renderWith(NO_BROWSER, OPENED);
  await sourceCode.click();
  await expect
    .element(alert)
    .toHaveTextContent("Couldn't open your browser. Try again.");

  await sourceCode.click();

  await expect.poll(() => alert.element().textContent.trim()).toBe("");
});

test("takes the failure down while it tries again, so a repeat is announced", async () => {
  const retry = Promise.withResolvers<OpenResult>();
  const { sourceCode, alert } = await renderWith(NO_BROWSER, retry.promise);
  await sourceCode.click();
  await expect
    .element(alert)
    .toHaveTextContent("Couldn't open your browser. Try again.");

  await sourceCode.click();

  await expect.poll(() => alert.element().textContent.trim()).toBe("");
});
