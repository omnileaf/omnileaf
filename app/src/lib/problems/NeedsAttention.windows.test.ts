import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { MissingFolder, StorageUse } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { drawnContrast } from "../../../tests/components/contrast-ratio";
import { resolvedColour } from "../../../tests/components/resolved-colour";

import { NeedsAttention, type Problem } from "./needs-attention.svelte";
import NeedsAttentionCard from "./NeedsAttentionCard.svelte";
import NeedsAttentionDot from "./NeedsAttentionDot.svelte";
import NeedsAttentionList from "./NeedsAttentionList.svelte";
import NeedsAttentionSheet from "./NeedsAttentionSheet.svelte";
import NeedsAttentionSidebarItem from "./NeedsAttentionSidebarItem.svelte";

const COMICS: Problem = {
  kind: "missingFolder",
  missing: {
    folder: {
      id: "5a4d1e00-0000-4000-8002-000000000002",
      kind: "linked",
      name: "Comics",
      location: "/media/Comics",
      isAvailable: false,
    },
    problem: { kind: "missing" },
    hiddenSeries: 41,
    isShownAnyway: false,
  } as MissingFolder,
};
const LOW_SPACE: Problem = { kind: "lowSpace", freeBytes: 2_000_000_000 };
const CONTEXT = { usesStandIns: false, device: "computer" } as const;

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.platform;
  delete document.body.dataset.sidebarHidden;
  document.body.replaceChildren();
});

function on(platform: "windows" | "macos", theme: "light" | "dark" = "light") {
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
}

function sidebarItem(isFolded = false) {
  return render(NeedsAttentionSidebarItem, {
    props: {
      problems: [COMICS],
      context: CONTEXT,
      isFolded,
      onFix: () => undefined,
    },
  });
}

function sizeOf(element: Element): readonly number[] {
  const box = element.getBoundingClientRect();
  return [box.width, box.height];
}

test("lists the problems as plain rows under rules with no frame on Windows", async () => {
  on("windows");
  const screen = await render(NeedsAttentionList, {
    props: {
      problems: [COMICS, LOW_SPACE],
      context: CONTEXT,
      onFix: () => undefined,
    },
  });

  const list = screen.getByRole("list").element();
  const [first] = screen.getByRole("listitem").elements();

  expect(getComputedStyle(list).borderTopWidth).toBe("0px");
  expect(getComputedStyle(first ?? list).borderBottomWidth).toBe("1px");
});

test("draws a row's fix as a standard 32px button on Windows", async () => {
  on("windows");
  const screen = await render(NeedsAttentionList, {
    props: {
      problems: [COMICS],
      context: CONTEXT,
      onFix: () => undefined,
    },
  });

  const fix = screen.getByRole("button", { name: "Find it" }).element();
  const style = getComputedStyle(fix);

  expect(style.height).toBe("32px");
  expect(style.borderTopLeftRadius).toBe("4px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-secondary", "backgroundColor"),
  );
});

test("sets a row's title in Body and its detail in Caption on Windows", async () => {
  on("windows");
  const screen = await render(NeedsAttentionList, {
    props: {
      problems: [COMICS],
      context: CONTEXT,
      onFix: () => undefined,
    },
  });

  const title = screen.getByText("Comics isn’t there").element();
  const detail = screen
    .getByText("41 series hidden", { exact: false })
    .element();

  expect([
    getComputedStyle(title).fontSize,
    getComputedStyle(detail).fontSize,
  ]).toEqual(["14px", "12px"]);
});

test("draws a row's warning icon in the warning ink on Windows", async () => {
  on("windows");
  const screen = await render(NeedsAttentionList, {
    props: {
      problems: [COMICS],
      context: CONTEXT,
      onFix: () => undefined,
    },
  });

  const icon = screen.getByRole("listitem").element().querySelector("svg");

  expect(getComputedStyle(icon ?? document.body).color).toBe(
    resolvedColour("--native-color-info-bar-warning-icon", "color"),
  );
});

test("keeps the framed list and round fix button on macOS", async () => {
  on("macos");
  const screen = await render(NeedsAttentionList, {
    props: {
      problems: [COMICS],
      context: CONTEXT,
      onFix: () => undefined,
    },
  });

  const list = screen.getByRole("list").element();
  const fix = screen.getByRole("button", { name: "Find it" }).element();

  expect(getComputedStyle(list).borderTopWidth).toBe("1px");
  expect(parseFloat(getComputedStyle(fix).borderTopLeftRadius)).toBeGreaterThan(
    4,
  );
});

test("counts the problems in a 16px accent InfoBadge after the row's words on Windows", async () => {
  on("windows");
  const screen = await sidebarItem();

  const badge = screen.getByText("1", { exact: true }).element();
  const style = getComputedStyle(badge);

  expect(sizeOf(badge)[1]).toBe(16);
  expect(style.borderTopLeftRadius).not.toBe("0px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
  expect(style.color).toBe(
    resolvedColour("--native-color-on-button-primary", "color"),
  );
});

test("puts the InfoBadge on the icon's corner when the pane is folded on Windows", async () => {
  on("windows");
  document.body.dataset.sidebarHidden = "";
  const screen = await sidebarItem(true);

  const button = screen.getByRole("button").element();
  const badge = screen.getByText("1", { exact: true }).element();
  const icon = button.querySelector("svg");

  expect(sizeOf(badge)[1]).toBe(16);
  expect(getComputedStyle(badge).position).toBe("absolute");
  expect(badge.getBoundingClientRect().top).toBeLessThan(
    icon?.getBoundingClientRect().top ?? 0,
  );
});

test("opens the problems in a flyout drawn like a Windows menu surface", async () => {
  on("windows");
  const screen = await sidebarItem();

  await screen.getByRole("button", { name: /^Needs attention/ }).click();
  const flyout = page.getByRole("dialog", { name: "Needs attention" });
  const style = getComputedStyle(flyout.element());

  expect(style.borderTopLeftRadius).toBe("8px");
  expect(style.backgroundColor).toBe(
    resolvedColour("--native-color-menu", "backgroundColor"),
  );
  expect(style.boxShadow).not.toBe("none");
});

test("moves focus into the flyout and back to the button when it closes on Windows", async () => {
  on("windows");
  const screen = await sidebarItem();
  const button = screen.getByRole("button", { name: /^Needs attention/ });

  await button.click();
  await expect
    .poll(() =>
      page
        .getByRole("dialog", { name: "Needs attention" })
        .element()
        .contains(document.activeElement),
    )
    .toBe(true);
  await userEvent.keyboard("{Escape}");

  await expect.element(button).toHaveFocus();
});

test("opens needs attention as a content dialog with a Close button on Windows", async () => {
  on("windows");
  const attention = new NeedsAttention(
    {
      missingFolders: () => Promise.resolve({ status: "ok", data: [] }),
      storageUse: () => undefined,
    },
    () => undefined,
  );
  attention.show();
  await render(NeedsAttentionSheet, {
    props: {
      attention,
      context: CONTEXT,
      onFix: () => undefined,
    },
  });

  const dialog = page.getByRole("dialog", { name: "Needs attention" });
  const close = page.getByRole("button", { name: "Close" });

  expect(getComputedStyle(dialog.element()).borderTopLeftRadius).toBe("8px");
  expect(getComputedStyle(close.element()).backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
  await close.click();
  expect(attention.isShown).toBe(false);
});

test("counts the problems in an InfoBadge on the card on Windows", async () => {
  on("windows");
  const screen = await render(NeedsAttentionCard, {
    count: 2,
    onOpen: () => undefined,
  });

  const badge = screen.getByText("2", { exact: true }).element();

  expect(sizeOf(badge)[1]).toBe(16);
  expect(getComputedStyle(badge).backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test("draws the heading's button as a 32px subtle button with the count's InfoBadge on Windows", async () => {
  on("windows");
  const screen = await render(NeedsAttentionDot, {
    count: 3,
    isOpen: false,
    onOpen: () => undefined,
  });

  const button = screen
    .getByRole("button", { name: /Needs attention/ })
    .element();
  const badge = screen.getByText("3", { exact: true }).element();

  expect(sizeOf(button)).toEqual([32, 32]);
  expect(button.querySelector("svg")).not.toBeNull();
  expect(sizeOf(badge)[1]).toBe(16);
});

for (const theme of ["light", "dark"] as const) {
  test(`reads a row's title, detail and warning icon at 4.5 to 1 on the dialog in the ${theme} theme`, async () => {
    on("windows", theme);
    const attention = new NeedsAttention(
      {
        missingFolders: () => Promise.resolve({ status: "ok", data: [] }),
        storageUse: () =>
          ({ isLow: true, freeBytes: 2_000_000_000 }) as StorageUse,
      },
      () => undefined,
    );
    attention.show();
    await render(NeedsAttentionSheet, {
      props: { attention, context: CONTEXT, onFix: () => undefined },
    });

    const dialog = page.getByRole("dialog", { name: "Needs attention" });
    const ground = getComputedStyle(dialog.element()).backgroundColor;
    const row = dialog.getByRole("listitem").element();
    const inks = [
      row.querySelector("svg"),
      page.getByText("Almost out of space").element(),
      page.getByText("left", { exact: false }).element(),
    ];

    for (const ink of inks) {
      const probe = document.createElement("div");
      probe.style.backgroundColor = ground;
      probe.style.color = getComputedStyle(ink ?? row).color;
      dialog.element().append(probe);
      expect(drawnContrast(probe)).toBeGreaterThanOrEqual(4.5);
    }
  });
}
