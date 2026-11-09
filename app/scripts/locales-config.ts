import { PSEUDO_LOCALE } from "../src/lib/language/pseudo-locale.ts";

export function offeredLocales(locales: readonly string[]): readonly string[] {
  return locales.filter((locale) => locale !== PSEUDO_LOCALE);
}

export function renderLocalesConfig(locales: readonly string[]): string {
  const entries = offeredLocales(locales).map(
    (locale) => `    <locale android:name="${locale}" />\n`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<locale-config xmlns:android="http://schemas.android.com/apk/res/android">
${entries.join("")}</locale-config>
`;
}
