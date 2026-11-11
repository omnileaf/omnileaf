import { m } from "#lib/paraglide/messages.js";

/** Android's WebView names the device in its user agent, as `Android 16; Pixel 8 Build/…`, which Chrome itself has stopped doing. */
const ANDROID_DEVICE = /\bAndroid [^;)]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/;

export function builtOn(value: string | undefined): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function deviceNameOf(userAgent: string): string | undefined {
  return ANDROID_DEVICE.exec(userAgent)?.[1];
}

export function buildDateText(built: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(built);
}

export function versionDetails(
  version: string,
  built: Date | undefined,
  device: string | undefined,
  locale: string,
): string {
  const details =
    built === undefined
      ? version
      : m.about_version_details_dated({
          version,
          date: buildDateText(built, locale),
        });
  return device === undefined
    ? details
    : m.about_version_details_on_device({ details, device });
}
