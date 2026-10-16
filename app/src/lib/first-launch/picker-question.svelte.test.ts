import { expect, test } from "vitest";

import { PickerQuestion } from "./picker-question.svelte";

test("lets the picker open at once where nothing needs saying first", async () => {
  const question = new PickerQuestion(() => false);

  const goesOn = await question.ask();

  expect([goesOn, question.isAsking]).toEqual([true, false]);
});

test("asks first and goes on with the answer", async () => {
  const question = new PickerQuestion(() => true);

  const answer = question.ask();
  const wasAsking = question.isAsking;
  question.answer(true);

  expect([wasAsking, await answer, question.isAsking]).toEqual([
    true,
    true,
    false,
  ]);
});

test("stops asking once the person has gone on", async () => {
  const question = new PickerQuestion(() => true);
  const first = question.ask();
  question.answer(true);
  await first;

  const goesOn = await question.ask();

  expect([goesOn, question.isAsking]).toEqual([true, false]);
});

test("asks again next time after Not now", async () => {
  const question = new PickerQuestion(() => true);
  const first = question.ask();
  question.answer(false);

  const declined = await first;
  void question.ask();

  expect([declined, question.isAsking]).toEqual([false, true]);
});
