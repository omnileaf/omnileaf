import { test } from "./fixtures.ts";
import { checkEveryScreenIn } from "./screen-checks.ts";

const WINDOW_WIDTHS = [
  360, 390, 480, 600, 768, 840, 1024, 1200, 1440, 1600,
] as const;
const WINDOW_HEIGHT = 800;

test.describe.configure({ mode: "parallel" });

for (const width of WINDOW_WIDTHS) {
  test.describe(`in a window ${String(width)}px wide`, () => {
    test.use({ viewport: { width, height: WINDOW_HEIGHT } });

    checkEveryScreenIn("light");
  });
}
