import { expect, test } from "vitest";

import english from "../messages/en.json" with { type: "json" };
import pseudo from "../messages/en-XA.json" with { type: "json" };
import {
  fromIcu,
  fromIcuFile,
  type Message,
  type Messages,
  toIcu,
  toIcuFile,
} from "./message-icu.ts";

const BOOKS: Message = [
  {
    declarations: [
      "input count",
      "local countPlural = count: plural",
      "local formattedCount = count: number",
    ],
    selectors: ["countPlural"],
    match: {
      "countPlural=one": "{formattedCount} book",
      "countPlural=other": "{formattedCount} books",
    },
  },
];

const GAPS: Message = [
  {
    declarations: [
      "input count",
      "input gaps",
      "input volumes",
      "local countPlural = count: plural",
      "local gapsPlural = gaps: plural",
    ],
    selectors: ["countPlural", "gapsPlural"],
    match: {
      "countPlural=one, gapsPlural=*": "Volume {volumes} isn’t in the folder.",
      "countPlural=other, gapsPlural=one": "Volumes {volumes} aren’t here.",
      "countPlural=other, gapsPlural=other": "Volumes {volumes} aren’t there.",
    },
  },
];

test("writes a plural message as one ICU plural with explicit number arguments", () => {
  expect(toIcu(BOOKS)).toBe(
    "{count, plural, one {{count, number} book} other {{count, number} books}}",
  );
});

test("leaves a plain message with a placeholder as it is", () => {
  expect(toIcu("Open {title}")).toBe("Open {title}");
});

test("nests a second selector and leaves a wildcard row as plain text", () => {
  expect(toIcu(GAPS)).toBe(
    "{count, plural, one {Volume {volumes} isn’t in the folder.} other {{gaps, plural, one {Volumes {volumes} aren’t here.} other {Volumes {volumes} aren’t there.}}}}",
  );
});

test("reads a single plural back into the source's variant structure", () => {
  expect(fromIcu(toIcu(BOOKS), BOOKS)).toEqual(BOOKS);
});

test("reads nested plurals and the wildcard row back", () => {
  expect(fromIcu(toIcu(GAPS), GAPS)).toEqual(GAPS);
});

test("takes the plural categories a translation writes, such as few and many", () => {
  const russian =
    "{count, plural, one {{count, number} книга} few {{count, number} книги} many {{count, number} книг} other {{count, number} книги}}";

  const [variant] = fromIcu(russian, BOOKS) as readonly [{ match: object }];

  expect(Object.keys(variant.match)).toEqual([
    "countPlural=one",
    "countPlural=few",
    "countPlural=many",
    "countPlural=other",
  ]);
});

test("refuses a number argument the source never formatted", () => {
  expect(() => fromIcu("{page, number}", BOOKS)).toThrow(/no number format/u);
});

test.each([
  ["en", english],
  ["en-XA", pseudo],
])("round-trips every %s message through ICU unchanged", (_, messages) => {
  const expected = Object.fromEntries(
    Object.entries(messages).filter(([key]) => !key.startsWith("$")),
  );

  const back = fromIcuFile(
    toIcuFile(expected as Messages),
    english as unknown as Messages,
  );

  expect(back).toEqual(expected);
  expect(JSON.stringify(back)).toBe(JSON.stringify(expected));
});
