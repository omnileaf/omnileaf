import { test } from "./fixtures.ts";
import { checkEveryScreenIn } from "./screen-checks.ts";

for (const theme of ["light", "dark"] as const) {
  test.describe(`in the ${theme} theme`, () => {
    checkEveryScreenIn(theme);
  });
}
