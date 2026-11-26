import { afterEach, expect, test, vi } from "vitest";

const kit = vi.hoisted(() => ({
  seen: [] as unknown[],
  whileStarting: undefined as (() => void) | undefined,
  isLate: false,
}));

vi.mock("$app/navigation", () => ({
  goto: (target: unknown, options: unknown) => {
    kit.seen.push([target, options]);
    if (kit.isLate) {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          kit.whileStarting?.();
          resolve();
        }, 0);
      });
    }
    kit.whileStarting?.();
    return Promise.resolve();
  },
}));

import {
  navigateAcrossOverlays,
  navigateTo,
  navigationStartedTo,
  optionsOfLinkClick,
} from "./navigate-to";

const links: HTMLElement[] = [];

afterEach(() => {
  kit.seen.length = 0;
  kit.whileStarting = undefined;
  kit.isLate = false;
  for (const link of links.splice(0)) {
    link.remove();
  }
});

function clickOnLink(attributes: Record<string, string>, inside = false) {
  const wrapper = document.createElement("div");
  const link = document.createElement("a");
  link.href = "/somewhere";
  for (const [name, value] of Object.entries(attributes)) {
    (inside ? wrapper : link).setAttribute(name, value);
  }
  wrapper.append(link);
  document.body.append(wrapper);
  links.push(wrapper);
  const event = new MouseEvent("click");
  link.dispatchEvent(event);
  return event;
}

test("hands SvelteKit the target and options it was given", async () => {
  await navigateTo("/series/1", { state: { libraryTag: "Sea" } });

  expect(kit.seen).toEqual([["/series/1", { state: { libraryTag: "Sea" } }]]);
});

test("lets a before-navigate hook find a navigation's options while SvelteKit starts it, and no longer afterwards", async () => {
  const target = new URL("/series/1", location.href);
  const found: unknown[] = [];
  kit.whileStarting = () => {
    found.push(navigationStartedTo(target));
  };

  await navigateTo("/series/1", { state: { libraryTag: "Sea" } });

  expect(found).toEqual([
    {
      href: target.href,
      options: { state: { libraryTag: "Sea" } },
      isAcrossOverlays: false,
    },
  ]);
  expect(navigationStartedTo(target)).toBeUndefined();
});

test("finds no options for a navigation to somewhere else", async () => {
  const found: unknown[] = [];
  kit.whileStarting = () => {
    found.push(navigationStartedTo(new URL("/elsewhere", location.href)));
  };

  await navigateTo("/series/1", { replace: true });

  expect(found).toEqual([undefined]);
});

test("marks a navigation that must go through overlays", async () => {
  const found: unknown[] = [];
  kit.whileStarting = () => {
    found.push(
      navigationStartedTo(new URL("/history", location.href))?.isAcrossOverlays,
    );
  };

  await navigateAcrossOverlays("/history");

  expect(found).toEqual([true]);
});

test("reads a link's replace and reset options from its own attributes", () => {
  const event = clickOnLink({
    "data-sveltekit-replacestate": "",
    "data-sveltekit-reset": "off",
  });

  expect(optionsOfLinkClick(event)).toEqual({ replace: true, reset: false });
});

test("reads a link's options from an element around it", () => {
  const event = clickOnLink({ "data-sveltekit-replacestate": "true" }, true);

  expect(optionsOfLinkClick(event)).toEqual({ replace: true });
});

test("reads no options from a link that sets none", () => {
  expect(optionsOfLinkClick(clickOnLink({}))).toBeUndefined();
});

test("reads no options from a click that is not on a link", () => {
  expect(optionsOfLinkClick(new MouseEvent("click"))).toBeUndefined();
  expect(optionsOfLinkClick(undefined)).toBeUndefined();
});

test("still finds a navigation's options when SvelteKit looks a moment after the call", async () => {
  const target = new URL("/series/1", location.href);
  const found: unknown[] = [];
  kit.isLate = true;
  kit.whileStarting = () => {
    found.push(navigationStartedTo(target)?.options);
  };

  await navigateTo("/series/1", { state: { libraryTag: "Sea" } });

  expect(found).toEqual([{ state: { libraryTag: "Sea" } }]);
});
