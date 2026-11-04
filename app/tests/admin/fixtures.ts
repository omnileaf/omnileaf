import {
  type ConsoleMessage,
  expect,
  type Page,
  test as base,
} from "@playwright/test";

interface Fixtures {
  readonly expectFailedLoads: (count: number) => void;
  readonly expectProblem: (pattern: RegExp) => void;
}

const FAILED_LOAD = "Failed to load resource";
const REPORTED_TYPES: ReadonlySet<string> = new Set(["error", "warning"]);
const DRIVER_SOURCE = "web-inspector://";
const INLINE_STYLE_REFUSAL = "Refused to apply a stylesheet";
const expectedFailedLoads = new WeakMap<Page, number>();
const expectedProblems = new WeakMap<Page, RegExp[]>();

export function isWebkit(page: Page): boolean {
  return page.context().browser()?.browserType().name() === "webkit";
}

/** Playwright's WebKit driver injects an inline stylesheet and script, which the page's policy refuses and logs natively, while the page's own violations still arrive as the `securitypolicyviolation` events reported below. */
function isWebkitDriverNoise(message: ConsoleMessage): boolean {
  const text = message.text();
  return text.includes(DRIVER_SOURCE) || text.startsWith(INLINE_STYLE_REFUSAL);
}

/** WebKit reports a style-src-attr violation for the inline style it gives a select element itself, and Svelte builds one detached while it checks for customisable selects, which makes the document the target of the event. */
function reportPolicyViolations(ignoresSelectStyles: boolean): void {
  globalThis.addEventListener("securitypolicyviolation", (event) => {
    const isSelectStyle =
      event.violatedDirective === "style-src-attr" &&
      (event.target instanceof HTMLSelectElement ||
        event.target instanceof Document);
    if (ignoresSelectStyles && isSelectStyle) {
      return;
    }
    console.error(
      `CSP violation: ${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}`,
    );
  });
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    const webkit = isWebkit(page);
    const problems: string[] = [];
    let failedLoads = 0;
    await page.addInitScript(reportPolicyViolations, webkit);
    page.on("console", (message) => {
      const text = message.text();
      if (
        !REPORTED_TYPES.has(message.type()) ||
        (webkit && isWebkitDriverNoise(message))
      ) {
        return;
      }
      if (text.startsWith(FAILED_LOAD)) {
        failedLoads += 1;
        return;
      }
      problems.push(`${message.type()}: ${text} ${message.location().url}`);
    });
    page.on("pageerror", (error) => {
      problems.push(`uncaught: ${error.message}`);
    });
    page.on("dialog", (dialog) => {
      problems.push(`dialog: ${dialog.message()}`);
      void dialog.dismiss();
    });
    await use(page);
    const expected = expectedProblems.get(page) ?? [];
    expect(
      problems.filter((problem) => !expected.some((p) => p.test(problem))),
      "console problems",
    ).toEqual([]);
    expect(
      expected.filter((p) => !problems.some((problem) => p.test(problem))),
      "expected console problems that never came",
    ).toEqual([]);
    expect(failedLoads, "failed loads").toBe(
      expectedFailedLoads.get(page) ?? 0,
    );
  },
  expectFailedLoads: async ({ page }, use) => {
    await use((count) => {
      expectedFailedLoads.set(page, count);
    });
  },
  expectProblem: async ({ page }, use) => {
    await use((pattern) => {
      expectedProblems.set(page, [
        ...(expectedProblems.get(page) ?? []),
        pattern,
      ]);
    });
  },
});

export { expect } from "@playwright/test";
