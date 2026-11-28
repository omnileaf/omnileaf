import { createSubscriber } from "svelte/reactivity";

export const LARGE_TEXT_SCALE = 1.3;

const TEXT_SCALE = "--text-scale";
const PROBE_STYLE = `position: fixed; inset-block-start: 0; visibility: hidden; pointer-events: none; block-size: 0; inline-size: calc(var(${TEXT_SCALE}) * 1rem);`;

function readScale(): number {
  const scale = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(TEXT_SCALE),
  );
  return Number.isFinite(scale) ? scale : 1;
}

export class TextScale {
  readonly #subscribe = createSubscriber((update) => {
    const probe = document.createElement("span");
    probe.ariaHidden = "true";
    probe.style.cssText = PROBE_STYLE;
    document.body.append(probe);
    const resizes = new ResizeObserver(update);
    resizes.observe(probe);
    return () => {
      resizes.disconnect();
      probe.remove();
    };
  });

  get isLarge(): boolean {
    this.#subscribe();
    return readScale() >= LARGE_TEXT_SCALE;
  }
}
