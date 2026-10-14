import { flushSync } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import TooltipHarness from "./TooltipHarness.svelte";

const LONG_PRESS_MS = 500;

function touch(element: Element, type: string): void {
  element.dispatchEvent(
    new PointerEvent(type, {
      pointerType: "touch",
      bubbles: true,
      cancelable: true,
    }),
  );
}

function tap(element: HTMLElement): void {
  touch(element, "pointerdown");
  touch(element, "pointerup");
  element.click();
}

function holdFor(element: Element, heldMs: number): void {
  vi.useFakeTimers();
  touch(element, "pointerdown");
  vi.advanceTimersByTime(heldMs);
  flushSync();
  vi.useRealTimers();
}

afterEach(() => {
  vi.useRealTimers();
});

async function showLabelledAction(
  label: string | undefined,
  onclick: () => void,
) {
  const screen = await render(TooltipHarness, { onclick, label });
  const action = screen.getByRole("button", { name: "Rescan Sample Comics" });
  await expect.element(action).toBeVisible();
  return { action };
}

function shownLabel(): Locator {
  return page.getByText("Rescan", { exact: true });
}

function showAction(onclick: () => void = () => undefined) {
  return showLabelledAction("Rescan", onclick);
}

test("shows the label while the pointer rests on the action", async () => {
  const { action } = await showAction();

  await userEvent.hover(action);

  await expect.element(shownLabel()).toBeVisible();
});

test("shows the label when the keyboard reaches the action", async () => {
  await showAction();

  await userEvent.tab();

  await expect.element(shownLabel()).toBeVisible();
});

test("keeps the action's own name and describes it with the label", async () => {
  const { action } = await showAction();

  await userEvent.tab();

  await expect.element(shownLabel()).toBeVisible();
  await expect.element(action).toHaveAccessibleName("Rescan Sample Comics");
  await expect.element(action).toHaveAccessibleDescription("Rescan");
});

test("leaves focus on the action while the label shows", async () => {
  const { action } = await showAction();

  await userEvent.tab();

  await expect.element(shownLabel()).toBeVisible();
  await expect.element(action).toHaveFocus();
});

test("shows the label once a finger has been held on the action", async () => {
  const { action } = await showAction();

  holdFor(action.element(), LONG_PRESS_MS);

  await expect.element(shownLabel()).toBeVisible();
});

test("doesn't run the action a long press ends with", async () => {
  const onclick = vi.fn();
  const { action } = await showAction(onclick);
  const element = action.element() as HTMLElement;
  holdFor(element, LONG_PRESS_MS);
  await expect.element(shownLabel()).toBeVisible();

  touch(element, "pointerup");
  element.click();

  expect(onclick).not.toHaveBeenCalled();
});

test("runs the action on a tap without showing the label", async () => {
  const onclick = vi.fn();
  const { action } = await showAction(onclick);

  vi.useFakeTimers();
  tap(action.element() as HTMLElement);
  vi.advanceTimersByTime(LONG_PRESS_MS * 2);
  flushSync();
  vi.useRealTimers();

  expect(onclick).toHaveBeenCalledOnce();
  await expect.element(shownLabel()).not.toBeInTheDocument();
});

test("shows nothing for an action left without a label", async () => {
  const onclick = vi.fn();
  const { action } = await showLabelledAction(undefined, onclick);
  await userEvent.hover(action);
  await userEvent.tab();
  holdFor(action.element(), LONG_PRESS_MS);

  (action.element() as HTMLElement).click();

  expect(onclick).toHaveBeenCalledOnce();
  await expect.element(shownLabel()).not.toBeInTheDocument();
});
