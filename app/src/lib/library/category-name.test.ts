import { expect, test } from "vitest";

import { categoryNameProblem } from "./category-name.ts";

const OTHERS = ["Manga", "Plan to read"];

test("accepts a name no other category has", () => {
  expect(categoryNameProblem("Later", OTHERS)).toBeUndefined();
});

test("refuses a name that is empty or only spaces", () => {
  expect([
    categoryNameProblem("", OTHERS),
    categoryNameProblem("   ", OTHERS),
  ]).toEqual(["empty", "empty"]);
});

test("refuses another category's name whatever its case, spacing or width", () => {
  expect([
    categoryNameProblem("manga", OTHERS),
    categoryNameProblem("  PLAN   to  read ", OTHERS),
    categoryNameProblem("ＭＡＮＧＡ", OTHERS),
  ]).toEqual(["taken", "taken", "taken"]);
});
