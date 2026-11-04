import { heading } from "./checks.ts";
import { expect, test } from "./fixtures.ts";
import { CODES, REPLY_ADDRESS } from "./samples.ts";
import { openSignedIn, signInAs } from "./sign-in.ts";

const ANNOUNCER = "svelte-announcer";
const VIOLATION_DEADLINE_MS = 2000;

test("the shell carries the real policy: its start script and the announcer style by hash, nothing else inline", async ({
  page,
}) => {
  await signInAs(page, "reviewer");

  const response = await page.goto("/admin");

  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
  expect(policy).toMatch(/style-src-attr 'unsafe-hashes' 'sha256-/);
  expect(policy).not.toContain("unsafe-inline");
  await expect(heading(page)).toHaveText("Dashboard");
  expect(
    await page.locator("script:not([src])").count(),
    "the hashed start script ran",
  ).toBeGreaterThan(0);
});

test("only the route announcer has a style attribute, on every page", async ({
  page,
}) => {
  await openSignedIn(page, "/admin");
  const inlineStyled = (): Promise<string[]> =>
    page
      .locator("[style]")
      .evaluateAll((elements) => elements.map((element) => element.id));

  await expect(heading(page)).toHaveText("Dashboard");
  expect(await inlineStyled()).toEqual([ANNOUNCER]);
  await page.getByRole("link", { name: /^Received\s/ }).click();
  await page.getByRole("link", { name: CODES.received }).click();
  await expect(heading(page)).toHaveText(CODES.received);

  expect(await inlineStyled()).toEqual([ANNOUNCER]);
});

test("every request goes to the admin origin", async ({ page, baseURL }) => {
  const origins = new Set<string>();
  page.on("request", (request) => {
    origins.add(new URL(request.url()).origin);
  });

  await openSignedIn(page, `/admin/reports/${CODES.received}`);
  await expect(heading(page)).toHaveText(CODES.received);

  expect([...origins]).toEqual([new URL(baseURL ?? "").origin]);
});

test("no answer of the api carries the reply address", async ({ page }) => {
  await openSignedIn(page, "/admin");

  for (const path of [
    "/admin/api/reports",
    `/admin/api/reports/${CODES.received}`,
    `/admin/api/reports/${CODES.received}/issue`,
  ]) {
    const answer = await page.request.get(path);
    expect(answer.status(), path).toBe(200);
    const text = await answer.text();
    expect(text, path).not.toContain(REPLY_ADDRESS);
    expect(text.toLowerCase(), path).not.toContain("replyaddress");
  }
});

test("the console guard reports a real inline style and style attribute @webkit", async ({
  page,
  expectProblem,
}) => {
  expectProblem(/style-src-elem inline|Applying inline style violates/);
  expectProblem(/style-src-attr inline|Applying inline style violates/);
  await openSignedIn(page, "/admin");

  await page.evaluate(async (deadlineMs) => {
    const violations = Promise.withResolvers<undefined>();
    let seen = 0;
    globalThis.addEventListener("securitypolicyviolation", () => {
      seen += 1;
      if (seen === 2) {
        violations.resolve(undefined);
      }
    });
    const deadline = new Promise((resolve) => setTimeout(resolve, deadlineMs));
    document.head.append(
      Object.assign(document.createElement("style"), {
        textContent: "body { color: red }",
      }),
    );
    const styled = document.createElement("div");
    styled.setAttribute("style", "color: red");
    document.body.append(styled);
    await Promise.race([violations.promise, deadline]);
  }, VIOLATION_DEADLINE_MS);
});
