import { afterEach, expect, test } from "vitest";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";

import { followDisplayModes } from "./display-modes";
import { followCorePlatform } from "./platform";
import { GROUP_PLATE } from "./plates";

function groupOnGroundOf(platform: Platform): CSSStyleDeclaration {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  const ground = document.createElement("div");
  ground.dataset.ground = "grouped";
  const group = document.createElement("ul");
  group.className = `rounded-list border border-border bg-card ${GROUP_PLATE}`;
  ground.append(group);
  document.body.append(ground);
  return getComputedStyle(group);
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  followDisplayModes({ contrast: undefined, transparency: undefined });
  document.body.replaceChildren();
});

test("sets iOS's grouped rows on a raised plate with 26 corners", () => {
  const group = groupOnGroundOf("ios");

  expect(group.backgroundColor).toBe("rgb(255, 255, 255)");
  expect(group.borderTopLeftRadius).toBe("26px");
  expect(group.borderTopColor).toBe("rgba(0, 0, 0, 0)");
});

test("raises iOS's dark plate a step under Increase Contrast", () => {
  followDisplayModes({ contrast: "more", transparency: undefined });

  const group = groupOnGroundOf("ios");
  document.documentElement.dataset.theme = "dark";

  expect(group.backgroundColor).toBe("rgb(36, 36, 38)");
});

test("deepens iOS's light grouped background under Increase Contrast", () => {
  followDisplayModes({ contrast: "more", transparency: undefined });
  followCorePlatform("ios");
  document.documentElement.dataset.theme = "light";
  const ground = document.createElement("div");
  ground.className = "bg-native-grouped-ground";
  document.body.append(ground);

  expect(getComputedStyle(ground).backgroundColor).toBe("rgb(235, 235, 240)");
});

test("lays Android's grouped rows straight on the window, with no plate", () => {
  const group = groupOnGroundOf("android");

  expect(group.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(group.borderTopLeftRadius).toBe("0px");
  expect(group.borderTopColor).toBe("rgba(0, 0, 0, 0)");
});

test("keeps today's bordered list on Linux", () => {
  const group = groupOnGroundOf("linux");

  expect(group.borderTopLeftRadius).toBe("10px");
  expect(group.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
});
