import { controlsLostOnInteraction } from "./control-ink.ts";
import { test } from "./fixtures.ts";
import { shiftsOnHover, shiftsOnOpening } from "./layout-shifts.ts";
import { checkEveryScreenIn } from "./screen-checks.ts";

const SCREEN_TIMEOUT_MS = 90_000;

test.describe.configure({ timeout: SCREEN_TIMEOUT_MS });

checkEveryScreenIn("light", {
  checks: [
    { name: "holds still on hover", problemsOn: shiftsOnHover },
    { name: "holds still behind what opens", problemsOn: shiftsOnOpening },
    {
      name: "keeps each control in sight on hover, focus and press",
      problemsOn: controlsLostOnInteraction,
    },
  ],
  passes: "holds still and stays in sight while each control is used",
  pace: "one after another",
});
