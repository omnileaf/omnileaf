import type { Platform } from "#lib/ipc/bindings.ts";

const DEFAULT_SYSTEM_BODY = 17;
const LARGEST_TEXT_SCALE = 2;
const TEXT_SCALE = "--text-scale";
const PROBE = "[data-system-text-size]";
/** Starts the probe at the default size, so where WebKit's system font keyword doesn't apply it reads as the default instead of inheriting the page's size. */
const PROBE_STYLE = `font-size: ${String(DEFAULT_SYSTEM_BODY)}px; font: -apple-system-body; position: fixed; inset-block-start: 0; visibility: hidden; pointer-events: none;`;

/** Never below 1, since WebKit on a Mac reports its system body font smaller than iOS's default. */
export function textScaleFor(bodySize: number): number {
  const scale = bodySize / DEFAULT_SYSTEM_BODY;
  return Number.isFinite(scale)
    ? Math.min(Math.max(scale, 1), LARGEST_TEXT_SCALE)
    : 1;
}

/** Keeps `--text-scale` on the root in step with iOS Dynamic Type, which WebKit only reports as the size of its system body font. */
export function followSystemTextSize(platform: Platform): void {
  if (platform !== "ios" || document.querySelector(PROBE) !== null) {
    return;
  }
  const probe = document.createElement("span");
  probe.dataset.systemTextSize = "";
  probe.ariaHidden = "true";
  probe.textContent = "M";
  probe.style.cssText = PROBE_STYLE;
  document.body.append(probe);
  const follow = (): void => {
    const bodySize = Number.parseFloat(getComputedStyle(probe).fontSize);
    document.documentElement.style.setProperty(
      TEXT_SCALE,
      String(textScaleFor(bodySize)),
    );
  };
  follow();
  new ResizeObserver(follow).observe(probe);
}
