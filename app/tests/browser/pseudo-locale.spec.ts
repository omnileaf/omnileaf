import { expect, test } from "./fixtures.ts";

const PAGES = [
  "/",
  "/browse",
  "/history",
  "/settings",
  "/settings/library",
  "/settings/general",
  "/settings/about",
];

const UNMARKED_TEXT_SCRIPT = `(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("script, style") ||
      node.parentElement?.closest("[lang]") !== document.documentElement
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const unmarked = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (/\\p{L}/u.test(text) && !text.includes("⟦")) {
      unmarked.push(text);
    }
  }
  return unmarked;
})()`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("omnileaf.language", "en-XA");
  });
});

for (const path of PAGES) {
  test(`${path} shows only translated text, without overflowing`, async ({
    page,
  }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("⟦");

    const unmarked: unknown = await page.evaluate(UNMARKED_TEXT_SCRIPT);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );

    expect(unmarked).toEqual([]);
    expect(overflows).toBe(false);
  });
}
