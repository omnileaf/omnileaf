import type { Locator } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import pseudo from "../../messages/en-XA.json" with { type: "json" };
import {
  EXPANDED_MIN_WIDTH,
  expect,
  LARGE_MIN_WIDTH,
  onPlatform,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";

const NARROWEST_TABLET = { width: EXPANDED_MIN_WIDTH, height: 1180 };
const TABLET_WINDOWS = [
  NARROWEST_TABLET,
  { width: 1024, height: 1366 },
  { width: 1032, height: 1376 },
  { width: 1180, height: 820 },
  { width: LARGE_MIN_WIDTH - 1, height: 820 },
];

interface LabelLines {
  readonly name: string;
  readonly lines: number;
  readonly breaksInsideAWord: boolean;
}

function labelLines(sections: Locator): Promise<LabelLines[]> {
  return sections.evaluateAll((links) =>
    links.map((link) => {
      const label = link.querySelector("span");
      const text = label?.firstChild;
      if (label === null || !(text instanceof Text)) {
        return {
          name: link.textContent.trim(),
          lines: 0,
          breaksInsideAWord: false,
        };
      }
      const range = document.createRange();
      const tops: number[] = [];
      for (let index = 0; index < text.length; index += 1) {
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        tops.push(Math.round(range.getBoundingClientRect().top));
      }
      const characters = [...text.data];
      const breaksInsideAWord = tops.some(
        (top, index) =>
          index > 0 &&
          top > (tops[index - 1] ?? top) &&
          characters[index - 1]?.trim() !== "" &&
          characters[index]?.trim() !== "",
      );
      return {
        name: text.data.trim(),
        lines: new Set(tops).size,
        breaksInsideAWord,
      };
    }),
  );
}

test.beforeEach(({ page: _page }, testInfo) => {
  test.skip(
    !testInfo.project.name.endsWith("tablet"),
    "tablet emulation sweeps its own windows",
  );
});

for (const platform of ["ios", "android"] as const) {
  for (const [language, messages] of [
    ["en", english],
    ["en-XA", pseudo],
  ] as const) {
    test.describe(`the Settings sections on ${platform} tablets in ${language}`, () => {
      test.use(onPlatform(platform));

      test("keep every section's name whole, on one line in English", async ({
        page,
      }) => {
        await page.addInitScript((chosen) => {
          localStorage.setItem("omnileaf.language", chosen);
        }, language);
        await page.setViewportSize(NARROWEST_TABLET);
        await page.goto("/settings/library");
        const sections = page
          .getByRole("navigation", { name: messages.settings_sections_label })
          .getByRole("link");
        await expect(sections.first()).toBeVisible();
        const linkCount = await sections.count();

        for (const window of TABLET_WINDOWS) {
          await page.setViewportSize(window);
          const at = `at ${String(window.width)}px`;

          const labels = await labelLines(sections);

          expect(
            labels.filter((label) => label.lines > 0),
            at,
          ).toHaveLength(linkCount);
          expect(
            labels
              .filter((label) => label.breaksInsideAWord)
              .map((label) => label.name),
            at,
          ).toEqual([]);
          if (language === "en") {
            expect(
              labels
                .filter((label) => label.lines > 1)
                .map((label) => label.name),
              at,
            ).toEqual([]);
          }
          expect(await sidewaysOverflow(page), at).toEqual([]);
        }
      });
    });
  }
}
