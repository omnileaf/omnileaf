import { test } from "./fixtures.ts";
import { shiftsOnHover, shiftsOnOpening } from "./layout-shifts.ts";
import { checkEveryScreenIn } from "./screen-checks.ts";

const SCREEN_TIMEOUT_MS = 90_000;

test.describe.configure({ mode: "parallel", timeout: SCREEN_TIMEOUT_MS });

checkEveryScreenIn("light", {
  checks: [
    { name: "holds still on hover", problemsOn: shiftsOnHover },
    { name: "holds still behind what opens", problemsOn: shiftsOnOpening },
  ],
  passes: "holds still while each control is hovered or opened",
});
