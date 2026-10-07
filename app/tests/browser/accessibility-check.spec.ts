import { accessibilityViolations, expect, test } from "./fixtures.ts";

const FADE_MS = 2000;

test("checks contrast only once a colour fade has finished", async ({
  page,
}) => {
  await page.setContent(`
    <html lang="en">
      <head><title>Fade</title></head>
      <body style="background: #ffffff">
        <main>
          <h1 id="heading" style="color: #eeeeee; transition: color ${String(FADE_MS)}ms steps(1, end)">
            Readable once the fade ends
          </h1>
        </main>
      </body>
    </html>
  `);
  await page.locator("#heading").evaluate((heading) => {
    heading.style.color = "#000000";
  });
  const runningAnimations = await page.evaluate(
    () => document.getAnimations().length,
  );
  expect(runningAnimations).toBe(1);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});

test("does not wait for an animation that never ends", async ({ page }) => {
  await page.setContent(`
    <html lang="en">
      <head>
        <title>Spinner</title>
        <style>
          @keyframes spin { to { transform: rotate(360deg); } }
          #spinner { animation: spin 1s linear infinite; }
        </style>
      </head>
      <body style="background: #ffffff">
        <main>
          <h1 style="color: #000000">A spinner turns beside this heading</h1>
          <svg id="spinner" width="16" height="16" aria-hidden="true"></svg>
        </main>
      </body>
    </html>
  `);

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});
