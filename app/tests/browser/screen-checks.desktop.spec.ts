import { test } from "./fixtures.ts";
import { checkEveryScreenIn } from "./screen-checks.ts";

const WINDOW_WIDTHS = [360, 600, 840, 1200, 1600] as const;
const WINDOW_HEIGHT = 800;

test.describe.configure({ mode: "parallel" });

for (const width of WINDOW_WIDTHS) {
  test.describe(`in a window ${String(width)}px wide`, () => {
    test.use({ viewport: { width, height: WINDOW_HEIGHT } });

    checkEveryScreenIn("light");
  });
}
