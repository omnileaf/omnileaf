import { afterEach, expect, test } from "vitest";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import { moreHeading } from "./more-heading";

const englishLocale = getLocale;

afterEach(() => {
  overwriteGetLocale(englishLocale);
});

test("names a book by its own title when the title says more than a number", () => {
  const heading = moreHeading("Letters from the North", "Sample Series 04");

  expect(heading).toEqual({ lead: "Letters from the North", tail: "" });
});

test("names the series first when the book's title is only a number", () => {
  const titles = ["Volume 3", "Vol. 12", "Chapter 148.5", "7", "Tome 2"];

  const headings = titles.map((title) => moreHeading(title, "Sample Series"));

  expect(headings.map(({ tail }) => tail)).toEqual(
    titles.map((title) => `· ${title}`),
  );
  expect(headings.every(({ lead }) => lead === "Sample Series")).toBe(true);
});

test("names the series first for a volume or chapter written the way other scripts and scanners write it", () => {
  const titles = [
    "第3巻",
    "3巻",
    "Vol.12",
    "#3",
    "제3권",
    "第12話",
    "第３巻",
    "3 巻",
    "Book #3",
  ];

  const headings = titles.map((title) => moreHeading(title, "Sample Series"));

  expect(headings.map(({ lead }) => lead)).toEqual(
    titles.map(() => "Sample Series"),
  );
});

test("names the series first for a comic's issue written as an issue or a number", () => {
  const titles = ["Issue 12", "Issue #4", "No. 5", "No.5", "no 7"];

  const headings = titles.map((title) => moreHeading(title, "Sample Series"));

  expect(headings.map(({ lead }) => lead)).toEqual(
    titles.map(() => "Sample Series"),
  );
});

test("keeps a title that holds a number as the book's own name", () => {
  const titles = [
    "The 7 Seas",
    "Letters from 1999",
    "2 Become 1",
    "Catch-22",
    "Room 101 at Night",
    "3 Days in Kyoto",
    "Fahrenheit 451",
    "Apollo 13",
    "Room 101",
    "MP3",
    "K2",
    "東京2020",
  ];

  const headings = titles.map((title) => moreHeading(title, "Sample Series"));

  expect(headings.map(({ lead }) => lead)).toEqual(titles);
});

test("lets the language write the mark between the series and the volume", () => {
  overwriteGetLocale(() => "en-XA");

  const heading = moreHeading("Volume 3", "Sample Series");

  expect(heading.tail).toMatch(/^⟦· Volume 3/);
});
