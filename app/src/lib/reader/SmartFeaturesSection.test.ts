import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import SmartFeaturesSection from "./SmartFeaturesSectionHarness.svelte";

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

test("sets the Android settings section flush, headed in the accent with 44px, its rows at 16px", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  const heading = screen
    .getByRole("heading", { name: "Smart features" })
    .element();
  const row = screen.getByRole("switch").first().element();
  const label = screen.getByText("Learn my reading speed").element();

  expect(heading.getBoundingClientRect().height).toBeCloseTo(44, 0);
  expect(getComputedStyle(heading).fontSize).toBe("14px");
  expect(getComputedStyle(heading).fontWeight).toBe("500");
  expect(getComputedStyle(row).borderTopWidth).toBe("0px");
  expect(getComputedStyle(label).letterSpacing).toBe("0.5px");
  expect(
    label.getBoundingClientRect().left - row.getBoundingClientRect().left,
  ).toBeCloseTo(16, 0);
});

test("keeps the compact sheet heading semibold on Android phones", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, { heading: "h3" });

  const heading = screen
    .getByRole("heading", { name: "Smart features" })
    .element();

  expect(getComputedStyle(heading).fontWeight).toBe("600");
});

test("keeps the bordered rows off Android", async () => {
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  const heading = screen
    .getByRole("heading", { name: "Smart features" })
    .element();

  expect(getComputedStyle(heading).fontWeight).toBe("600");
});

test("disables the Android time left switch once reading speed is off", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  await screen.getByRole("button", { name: "Turn all off" }).click();

  await expect
    .element(screen.getByRole("switch", { name: "Show time left" }))
    .toBeDisabled();
});

const LOOKS = [
  { platform: "android", size: "regular" },
  { platform: "android", size: "flat" },
  { platform: "ios", size: "regular" },
  { platform: "ios", size: "small" },
] as const;

const DESKTOP_LOOKS = (["linux", "macos", "windows"] as const).flatMap(
  (platform) =>
    (["regular", "small"] as const).map((size) => ({ platform, size })),
);

for (const { platform, size } of LOOKS) {
  test(`ends the ${platform} ${size} list with Turn all off as a row as wide as the switches`, async () => {
    followCorePlatform(platform);
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });

    const row = screen.getByRole("button", { name: "Turn all off" }).element();
    const lastSwitch = screen.getByRole("switch").last().element();
    const rowBox = row.getBoundingClientRect();
    const switchBox = lastSwitch.getBoundingClientRect();

    expect(row.previousElementSibling).toBe(lastSwitch);
    expect(row.nextElementSibling).toBeNull();
    expect(rowBox.left).toBeCloseTo(switchBox.left, 0);
    expect(rowBox.width).toBeCloseTo(switchBox.width, 0);
  });

  test(`leads the ${platform} ${size} Turn all off row with a power icon`, async () => {
    followCorePlatform(platform);
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });

    const row = screen.getByRole("button", { name: "Turn all off" }).element();
    const icon = row.querySelector("[data-icon='power']");
    const label = screen.getByText("Turn all off").element();

    expect(icon).not.toBeNull();
    expect(icon?.getBoundingClientRect().right).toBeLessThan(
      label.getBoundingClientRect().left,
    );
  });

  test(`says All off on the ${platform} ${size} row and disables it once every smart feature is off`, async () => {
    followCorePlatform(platform);
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });

    await screen.getByRole("button", { name: "Turn all off" }).click();

    await expect
      .element(screen.getByRole("button", { name: "All off" }))
      .toHaveAttribute("aria-disabled", "true");
    await expect
      .element(screen.getByRole("button", { name: "Turn all off" }))
      .not.toBeInTheDocument();
  });

  test(`keeps focus on the ${platform} ${size} row once Enter turns everything off`, async () => {
    followCorePlatform(platform);
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });
    const row = screen.getByRole("button", { name: "Turn all off" }).element();
    (row as HTMLElement).focus();

    await userEvent.keyboard("{Enter}");

    await expect
      .element(screen.getByRole("button", { name: "All off" }))
      .toHaveFocus();
    expect(document.activeElement).toBe(row);
  });
}

function fadeOf(element: Element | null): string {
  return element === null ? "missing" : getComputedStyle(element).opacity;
}

function colourOf(className: string): string {
  const probe = document.createElement("span");
  probe.className = className;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

for (const size of ["regular", "flat"] as const) {
  test(`fades the Android ${size} row's icon and words once everything is off`, async () => {
    followCorePlatform("android");
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });
    await screen.getByRole("button", { name: "Turn all off" }).click();

    const row = screen.getByRole("button", { name: "All off" }).element();
    const label = screen.getByText("All off").element();

    expect(fadeOf(row.querySelector("[data-icon='power']"))).toBe("0.38");
    expect(fadeOf(label)).toBe("0.38");
    expect(getComputedStyle(label).color).toBe(colourOf("text-foreground"));
  });
}

test("sets the Android sheet row's words 16px after its icon", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h3",
    size: "flat",
  });

  const row = screen.getByRole("button", { name: "Turn all off" }).element();
  const icon = row.querySelector("[data-icon='power']");
  const label = screen.getByText("Turn all off").element();

  expect(
    label.getBoundingClientRect().left -
      (icon?.getBoundingClientRect().right ?? 0),
  ).toBeCloseTo(16, 0);
});

for (const size of ["regular", "small"] as const) {
  test(`starts the iOS ${size} row's words 42px in, after a 30px icon slot`, async () => {
    followCorePlatform("ios");
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });

    const row = screen.getByRole("button", { name: "Turn all off" }).element();
    const icon = row.querySelector("[data-icon='power']");
    const label = screen.getByText("Turn all off").element();
    const start = row.getBoundingClientRect().left;
    const iconBox = icon?.getBoundingClientRect();

    expect(label.getBoundingClientRect().left - start).toBeCloseTo(42, 0);
    expect(
      (iconBox?.left ?? 0) - start + (iconBox?.width ?? 0) / 2,
    ).toBeCloseTo(15, 0);
  });

  test(`draws the iOS ${size} row in the faint colour once everything is off`, async () => {
    followCorePlatform("ios");
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });
    await screen.getByRole("button", { name: "Turn all off" }).click();

    const row = screen.getByRole("button", { name: "All off" }).element();
    const faint = colourOf("text-faint");

    expect(getComputedStyle(screen.getByText("All off").element()).color).toBe(
      faint,
    );
    expect(
      getComputedStyle(row.querySelector("[data-icon='power']") ?? row).color,
    ).toBe(faint);
  });
}

for (const { platform, size } of DESKTOP_LOOKS) {
  test(`offers no Turn all off on the ${platform} ${size} list`, async () => {
    followCorePlatform(platform);

    const screen = await render(SmartFeaturesSection, { heading: "h2", size });

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  test(`still turns a single ${platform} ${size} switch off`, async () => {
    followCorePlatform(platform);
    const screen = await render(SmartFeaturesSection, { heading: "h2", size });
    const toggle = screen.getByRole("switch", { name: /^Book summary/ });

    await toggle.click();

    await expect.element(toggle).not.toBeChecked();
  });
}

test("offers Turn all off again once a smart feature is turned back on", async () => {
  followCorePlatform("ios");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });
  await screen.getByRole("button", { name: "Turn all off" }).click();

  await screen.getByRole("switch", { name: /^Book summary/ }).click();

  await expect
    .element(screen.getByRole("button", { name: "Turn all off" }))
    .toBeEnabled();
});

test("sets the Android settings Turn all off row 56px tall, its icon at 16px and its words at 56px", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });

  const row = screen.getByRole("button", { name: "Turn all off" }).element();
  const icon = row.querySelector("[data-icon='power']");
  const label = screen.getByText("Turn all off").element();
  const start = row.getBoundingClientRect().left;

  expect(row.getBoundingClientRect().height).toBeCloseTo(56, 0);
  expect(icon?.getBoundingClientRect().left).toBeCloseTo(start + 16, 0);
  expect(label.getBoundingClientRect().left - start).toBeCloseTo(56, 0);
});

test("draws the iOS Turn all off row in the accent", async () => {
  followCorePlatform("ios");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });
  const accent = document.createElement("span");
  accent.className = "text-accent";
  document.body.append(accent);

  const accentColour = getComputedStyle(accent).color;
  accent.remove();

  const label = screen.getByText("Turn all off").element();

  expect(getComputedStyle(label).color).toBe(accentColour);
});

test("turns a single Android switch off when it is pressed", async () => {
  followCorePlatform("android");
  const screen = await render(SmartFeaturesSection, {
    heading: "h2",
    size: "regular",
  });
  const toggle = screen.getByRole("switch", { name: "Learn my reading speed" });
  await expect.element(toggle).toBeChecked();

  await toggle.click();

  await expect.element(toggle).not.toBeChecked();
  await expect
    .element(screen.getByRole("switch", { name: /^Choose the reading mode/ }))
    .toBeChecked();
});
