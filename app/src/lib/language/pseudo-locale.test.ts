import { expect, test } from "vitest";

import english from "../../../messages/en.json";
import pseudo from "../../../messages/en-XA.json";
import { pseudoMessages, pseudoText } from "./pseudo-locale";

test("marks, accents and lengthens text", () => {
  const text = pseudoText("Add a folder");

  expect(text.startsWith("⟦")).toBe(true);
  expect(text.endsWith("⟧")).toBe(true);
  expect(text).not.toContain("Add a folder");
  expect(text.length).toBeGreaterThanOrEqual(
    Math.ceil("Add a folder".length * 1.4),
  );
});

test("keeps placeholders exactly as they are", () => {
  const text = pseudoText("Found {formattedCount} comics in {name}.");

  expect(text).toContain("{formattedCount}");
  expect(text).toContain("{name}");
});

test("rewrites every plural variant and keeps the plural structure", () => {
  const messages = pseudoMessages({
    found: [
      {
        declarations: ["input count"],
        selectors: ["count"],
        match: { "count=one": "One comic", "count=other": "{count} comics" },
      },
    ],
  });

  expect(messages).toEqual({
    found: [
      {
        declarations: ["input count"],
        selectors: ["count"],
        match: {
          "count=one": pseudoText("One comic"),
          "count=other": pseudoText("{count} comics"),
        },
      },
    ],
  });
});

test("the committed pseudo-locale matches the English messages", () => {
  expect(pseudo).toEqual(pseudoMessages(english));
});
