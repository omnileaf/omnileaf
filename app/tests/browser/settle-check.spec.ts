import { expect, settle, test } from "./fixtures.ts";

const HELD_IN_STARTING_STYLE_MS = 4000;
const NEVER_ENDING_SLIDE_S = 3600;

test("finishes a slide that starts only once the grace period is over", async ({
  page,
}) => {
  await page.setContent(`
    <html lang="en">
      <head>
        <title>Settle</title>
        <style>
          #sheet { transition: translate ${String(NEVER_ENDING_SLIDE_S)}s linear; }
          #sheet[data-starting-style] { translate: 0 100%; }
        </style>
      </head>
      <body>
        <div id="sheet" role="dialog" aria-label="Sheet" data-starting-style>Sheet</div>
      </body>
    </html>
  `);
  const sheet = page.getByRole("dialog", { name: "Sheet" });
  await sheet.evaluate((element, heldMs) => {
    setTimeout(() => {
      element.removeAttribute("data-starting-style");
    }, heldMs);
  }, HELD_IN_STARTING_STYLE_MS);

  await settle(sheet);

  expect(
    await sheet.evaluate((element) => ({
      animations: element.getAnimations().length,
      translate: getComputedStyle(element).translate,
    })),
  ).toEqual({ animations: 0, translate: "none" });
});
