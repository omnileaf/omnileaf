import { expect, test } from "vitest";

import { PageTurner } from "./page-turner.svelte";

const PAGES = 30;

test("opens on the page it starts from", () => {
  const turner = new PageTurner(PAGES, 13);

  expect(turner.shown).toBe(13);
});

test("opens a book started past what it holds now on its last page", () => {
  const turner = new PageTurner(PAGES, 40);

  expect(turner.shown).toBe(PAGES - 1);
});

test("turns a page at a time either way", () => {
  const turner = new PageTurner(PAGES, 4);

  turner.turn(1);
  const forward = turner.shown;
  turner.turn(-1);
  turner.turn(-1);

  expect([forward, turner.shown]).toEqual([5, 3]);
});

test("stays on the first and last pages when asked to turn past them", () => {
  const turner = new PageTurner(PAGES, 0);

  turner.turn(-1);
  const atStart = [turner.shown, turner.isFirst, turner.isLast];
  turner.goTo(PAGES + 5);

  expect(atStart).toEqual([0, true, false]);
  expect([turner.shown, turner.isFirst, turner.isLast]).toEqual([
    PAGES - 1,
    false,
    true,
  ]);
});

test("goes straight to a page, a whole one within the book", () => {
  const turner = new PageTurner(PAGES, 0);

  turner.goTo(17.6);
  const whole = turner.shown;
  turner.goTo(-3);

  expect([whole, turner.shown]).toEqual([17, 0]);
});

test("turns past the last page once, and back onto it", () => {
  const turner = new PageTurner(PAGES, PAGES - 1);

  turner.turn(1);
  turner.turn(1);
  const past = [turner.shown, turner.isPastEnd];
  turner.turn(-1);

  expect(past).toEqual([PAGES - 1, true]);
  expect([turner.shown, turner.isPastEnd]).toEqual([PAGES - 1, false]);
});

test("is past the end only from the last page", () => {
  const turner = new PageTurner(PAGES, PAGES - 2);

  turner.turn(1);
  const onLast = turner.isPastEnd;
  turner.turn(1);
  const past = turner.isPastEnd;
  turner.goTo(3);

  expect([onLast, past, turner.isPastEnd]).toEqual([false, true, false]);
});
