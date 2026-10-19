import type { Page } from "@playwright/test";

import english from "../../messages/en.json" with { type: "json" };
import { expect } from "./fixtures.ts";

type StepButtonNames = Pick<
  typeof english,
  "first_launch_get_started" | "first_launch_continue"
>;

export async function goToStep(
  page: Page,
  step: number,
  messages: StepButtonNames = english,
): Promise<void> {
  const leaveWith = [
    messages.first_launch_get_started,
    messages.first_launch_continue,
    messages.first_launch_continue,
    messages.first_launch_continue,
  ];
  await page.goto("/first-launch");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const name of leaveWith.slice(0, step)) {
    await page
      .getByRole("main")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  }
}
