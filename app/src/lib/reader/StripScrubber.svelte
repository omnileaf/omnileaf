<script lang="ts">
  import { Slider } from "bits-ui";

  import { m } from "#lib/paraglide/messages.js";

  import { STRIP_SCRUBBER } from "./strip-scrubber-look.ts";

  type KeyHandler = (event: KeyboardEvent) => void;

  const RESOLUTION = 1000;
  const VERTICAL_TOP_IS_START = "rtl";

  let {
    progress,
    shown,
    count,
    position,
    onScrub,
    onSeek,
  }: {
    progress: number;
    shown: number;
    count: number;
    position: string;
    onScrub: (along: number) => void;
    onSeek: (index: number) => void;
  } = $props();

  function step(key: string): number | undefined {
    if (key === "ArrowDown" || key === "ArrowRight" || key === "PageDown") {
      return shown + 1;
    }
    if (key === "ArrowUp" || key === "ArrowLeft" || key === "PageUp") {
      return shown - 1;
    }
    return undefined;
  }

  function isKeyHandler(value: unknown): value is KeyHandler {
    return typeof value === "function";
  }

  function keyHandler(props: Record<string, unknown>): KeyHandler {
    const inherited = props.onkeydown;
    return (event) => {
      const target = step(event.key);
      if (target === undefined) {
        if (isKeyHandler(inherited)) {
          inherited(event);
        }
        return;
      }
      event.preventDefault();
      if (target >= 0 && target < count) {
        onSeek(target);
      }
    };
  }
</script>

<div data-scrubber class={STRIP_SCRUBBER.root}>
  <Slider.Root
    type="single"
    min={0}
    max={RESOLUTION}
    step={1}
    value={Math.round(progress * RESOLUTION)}
    orientation="vertical"
    dir={VERTICAL_TOP_IS_START}
    thumbPositioning="exact"
    onValueChange={(value) => {
      onScrub(value / RESOLUTION);
    }}
    class={STRIP_SCRUBBER.track}
    style={`--progress: ${String(progress)}`}
  >
    <span aria-hidden="true" data-scrubber-range class={STRIP_SCRUBBER.range}
    ></span>
    <span aria-hidden="true" data-scrubber-rest class={STRIP_SCRUBBER.rest}
    ></span>
    <Slider.Thumb index={0}>
      {#snippet child({ props }: { props: Record<string, unknown> })}
        <span
          {...props}
          style={undefined}
          data-scrubber-handle
          aria-label={m.reader_slider()}
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={shown + 1}
          aria-valuetext={m.reader_slider_value({ page: shown + 1, count })}
          class={STRIP_SCRUBBER.handle}
          onkeydown={keyHandler(props)}
        ></span>
      {/snippet}
    </Slider.Thumb>
    <span aria-hidden="true" data-scrubber-count class={STRIP_SCRUBBER.count}
      >{position}</span
    >
  </Slider.Root>
</div>
