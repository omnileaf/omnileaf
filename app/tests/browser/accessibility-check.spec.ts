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
          <h1 id="heading" style="color: #eeeeee; transition: color ${String(FADE_MS)}ms linear">
            Readable once the fade ends
          </h1>
        </main>
      </body>
    </html>
  `);
  await page.locator("#heading").evaluate((heading) => {
    heading.style.color = "#000000";
  });

  const violations = await accessibilityViolations(page);

  expect(violations).toEqual([]);
});
