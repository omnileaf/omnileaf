import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { ANDROID_PICKING } from "./phone-picking.ts";
import PickingToolbar from "./PickingToolbar.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

function colourOf(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

test("greys Android's docked actions in the kit's disabled label colour while nothing is picked", async () => {
  await page.viewport(390, 844);
  followCorePlatform("android");
  document.body.append(document.createElement("main"));
  await render(PickingToolbar, {
    props: { picking: ANDROID_PICKING, count: 0, onMark: () => undefined },
  });
  const markRead = page.getByRole("button", { name: "Mark read" });
  await expect.element(markRead).toBeDisabled();

  expect(getComputedStyle(markRead.element()).color).toBe(
    colourOf("var(--native-color-on-control-disabled)"),
  );
});
