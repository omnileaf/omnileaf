import { spawnSync } from "node:child_process";
import { release } from "node:os";

import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";

const IS_WINDOWS = process.platform === "win32";
const FIRST_SYSTEM_BACKDROP_BUILD = 22_523;
const PERSONALIZE_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`;
const TRANSPARENCY_ON = /EnableTransparency\s+REG_DWORD\s+0x0*[1-9a-f]/i;
const DWMSBT_MAINWINDOW = 2;

const REPORTED_BACKDROP = `return window.__TAURI_INTERNALS__.invoke("app_info").then((info) => info.windowBackdrop);`;
const DRAWN_BACKDROP_TYPE = `return window.__TAURI_INTERNALS__.invoke("window_backdrop_type");`;

const appSession = useAppSession();

function windowsBuild(): number {
  return Number(release().split(".")[2]);
}

function hasTransparencyEffectsOn(): boolean {
  const setting = spawnSync(
    "reg",
    ["query", PERSONALIZE_KEY, "/v", "EnableTransparency"],
    { encoding: "utf8" },
  );
  return TRANSPARENCY_ON.test(setting.stdout);
}

test.runIf(IS_WINDOWS)(
  "reports Mica on Windows 11 with transparency effects on and a solid window otherwise",
  async () => {
    const expected =
      windowsBuild() >= FIRST_SYSTEM_BACKDROP_BUILD &&
      hasTransparencyEffectsOn()
        ? "mica"
        : "none";

    const reported = await appSession().run(REPORTED_BACKDROP);

    expect(reported).toBe(expected);
  },
);

test.runIf(IS_WINDOWS)(
  "has Windows draw Mica behind the window only when it reports Mica",
  async () => {
    const reported = await appSession().run(REPORTED_BACKDROP);

    const drawn = await appSession().run(DRAWN_BACKDROP_TYPE);

    expect(drawn === DWMSBT_MAINWINDOW).toBe(reported === "mica");
  },
);
