import { expect, test } from "vitest";

import "../../app.css";

import {
  contrastOver,
  contrastRatio,
} from "../../../tests/components/contrast-ratio";

test("refuses a colour token the stylesheet does not define", () => {
  expect(() => contrastRatio("no-such-colour", "on-surface")).toThrow(
    "--native-color-no-such-colour is not defined",
  );
  expect(() => contrastOver("on-surface", ["no-such-colour"])).toThrow(
    "--native-color-no-such-colour is not defined",
  );
});
