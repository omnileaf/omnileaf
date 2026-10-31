import { expect, test, vi } from "vitest";

import { selectionActions } from "./selection-actions.ts";

function actionsOf(keepsLabels: boolean) {
  const onLabels = vi.fn();
  const onMarkRead = vi.fn();
  return {
    actions: selectionActions({ keepsLabels, onLabels, onMarkRead }),
    onLabels,
    onMarkRead,
  };
}

test("offers Categories, Tags and Mark as read when labels are kept", () => {
  const { actions } = actionsOf(true);

  expect(actions.map(({ label }) => label)).toEqual([
    "Categories",
    "Tags",
    "Mark as read",
  ]);
});

test("offers only Mark as read when no labels are kept", () => {
  const { actions } = actionsOf(false);

  expect(actions.map(({ label }) => label)).toEqual(["Mark as read"]);
});

test("runs the callback each action stands for", () => {
  const { actions, onLabels, onMarkRead } = actionsOf(true);

  for (const action of actions) {
    action.act();
  }

  expect([onLabels.mock.calls, onMarkRead.mock.calls.length]).toEqual([
    [["categories"], ["tags"]],
    1,
  ]);
});
