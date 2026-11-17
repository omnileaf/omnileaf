import { afterAll, beforeAll, test } from "vitest";

import { adbShell, androidSetting } from "./android-settings.ts";
import {
  clickWhenShown,
  expectStillOn,
  mainNavigationLink,
  shownPage,
  useAppSession,
} from "./app-session.ts";

const DEFAULT_FONT_SCALE = 1;
const LARGER_FONT_SCALE = 1.3;
const PROBE_FONT_SIZE_PX = 100;
const FONT_SIZE_TOLERANCE_PX = 0.5;
const BASELINE_DENSITY = 160;
const LARGER_DISPLAY = 1.25;
const PIXEL_RATIO_TOLERANCE = 0.01;

interface Densities {
  readonly physical: number;
  readonly override: number | undefined;
}

const fontScale = androidSetting("system", "font_scale");

const appSession = useAppSession();

let fontScaleBefore: string | undefined;
let densitiesBefore: Densities | undefined;

beforeAll(async () => {
  fontScaleBefore = await fontScale.read();
  densitiesBefore = densitiesIn(await adbShell("wm", "density"));
});

afterAll(async () => {
  if (fontScaleBefore !== undefined) {
    await fontScale.restore(fontScaleBefore);
  }
});

afterAll(async () => {
  if (densitiesBefore !== undefined) {
    await restoreDensity(densitiesBefore);
  }
});

function densityNamed(output: string, name: string): number | undefined {
  const found = new RegExp(`${name} density: (\\d+)`).exec(output)?.[1];
  return found === undefined ? undefined : Number(found);
}

function densitiesIn(output: string): Densities {
  const physical = densityNamed(output, "Physical");
  if (physical === undefined) {
    throw new Error(`read no physical density from "${output}"`);
  }
  return { physical, override: densityNamed(output, "Override") };
}

async function setDensity(density: number): Promise<void> {
  await adbShell("wm", "density", String(density));
}

async function restoreDensity({ override }: Densities): Promise<void> {
  await adbShell(
    "wm",
    "density",
    override === undefined ? "reset" : String(override),
  );
}

function hasProbeFontSize(pixels: number): string {
  return `const probe = document.createElement("span");
    probe.style.fontSize = "${String(PROBE_FONT_SIZE_PX)}px";
    document.body.append(probe);
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return Math.abs(size - ${String(pixels)}) < ${String(FONT_SIZE_TOLERANCE_PX)};`;
}

function hasPixelRatioFor(density: number): string {
  const ratio = density / BASELINE_DENSITY;
  return `return Math.abs(window.devicePixelRatio - ${String(ratio)}) < ${String(PIXEL_RATIO_TOLERANCE)};`;
}

async function openSettings(): Promise<void> {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await shownPage(appSession(), "Settings");
}

test("follows Android's font size without leaving the page", async () => {
  await openSettings();
  await fontScale.put(String(DEFAULT_FONT_SCALE));
  await appSession().waitUntil(
    hasProbeFontSize(PROBE_FONT_SIZE_PX * DEFAULT_FONT_SCALE),
    "text at the default font size",
  );
  const windowsBefore = await appSession().windows();

  await fontScale.put(String(LARGER_FONT_SCALE));
  await appSession().waitUntil(
    hasProbeFontSize(PROBE_FONT_SIZE_PX * LARGER_FONT_SCALE),
    "text at the larger font size",
  );

  await expectStillOn(appSession(), windowsBefore, "Settings");
});

test("follows Android's display size without leaving the page", async () => {
  if (densitiesBefore === undefined) {
    throw new Error("the display density was not read before the test");
  }
  const { physical } = densitiesBefore;
  const larger = Math.round(physical * LARGER_DISPLAY);
  await openSettings();
  await setDensity(physical);
  await appSession().waitUntil(
    hasPixelRatioFor(physical),
    "the page laid out for the physical display size",
  );
  const windowsBefore = await appSession().windows();

  await setDensity(larger);
  await appSession().waitUntil(
    hasPixelRatioFor(larger),
    "the page laid out for the larger display size",
  );

  await expectStillOn(appSession(), windowsBefore, "Settings");
});
