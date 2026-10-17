import { test } from "./fixtures.ts";
import { shiftsOnHover } from "./layout-shifts.ts";
import { checkEveryScreenIn } from "./screen-checks.ts";

test.describe.configure({ mode: "parallel" });

checkEveryScreenIn("light", {
  checks: [{ name: "holds still on hover", problemsOn: shiftsOnHover }],
  passes: "holds still while each control is hovered",
});
