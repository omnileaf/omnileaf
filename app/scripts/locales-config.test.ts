import { expect, test } from "vitest";

import settings from "../project.inlang/settings.json";
import { PSEUDO_LOCALE } from "../src/lib/language/pseudo-locale.ts";
import { offeredLocales, renderLocalesConfig } from "./locales-config.ts";

const COMMITTED = import.meta.glob<string>(
  "../src-tauri/gen/android/app/src/main/res/xml/locales_config.xml",
  { query: "?raw", import: "default", eager: true },
);

const [committedConfig] = Object.values(COMMITTED);

const MANIFEST = import.meta.glob<string>(
  "../src-tauri/gen/android/app/src/main/AndroidManifest.xml",
  { query: "?raw", import: "default", eager: true },
);

const [manifest] = Object.values(MANIFEST);

test("lists a locale per line and leaves the pseudo locale out", () => {
  const config = renderLocalesConfig(["en", "pt-BR", PSEUDO_LOCALE]);

  expect(config).toContain('<locale android:name="en" />');
  expect(config).toContain('<locale android:name="pt-BR" />');
  expect(config).not.toContain(PSEUDO_LOCALE);
});

test("offers every locale the messages are translated into except the pseudo one", () => {
  const offered = offeredLocales(settings.locales);

  expect(offered).toContain(settings.baseLocale);
  expect(offered).not.toContain(PSEUDO_LOCALE);
  for (const locale of offered) {
    expect(committedConfig).toContain(`<locale android:name="${locale}" />`);
  }
});

test("keeps the committed locales_config.xml as the generator writes it", () => {
  expect(committedConfig).toBe(renderLocalesConfig(settings.locales));
});

test("hands the locale list to Android in the manifest", () => {
  expect(manifest).toContain('android:localeConfig="@xml/locales_config"');
});
