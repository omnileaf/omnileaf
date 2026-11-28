<script lang="ts">
  import { Portal } from "bits-ui";
  import type { ComponentProps } from "svelte";

  import { NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BarControls from "./BarControls.svelte";
  import type { PhonePicking } from "./phone-picking";

  let {
    picking,
    look,
    count,
    countId,
    element = $bindable(),
    countElement = $bindable(null),
    ...controls
  }: Omit<ComponentProps<typeof BarControls>, "controls"> & {
    picking: PhonePicking;
    look: string;
    count: number;
    countId: string;
    element?: HTMLElement | undefined;
    countElement?: HTMLElement | null;
  } = $props();
</script>

<Portal to="main">
  <div bind:this={element} data-picking-bar class={look}>
    <BarControls controls={picking.leading} {...controls} />
    <h2
      bind:this={countElement}
      id={countId}
      tabindex="-1"
      aria-live="polite"
      class="flex-1 wrap-break-word min-inline-none {NATIVE_TOP_BAR.barTitle}"
    >
      {m.series_selected_count({ count })}
    </h2>
    <BarControls controls={picking.trailing} {...controls} />
  </div>
</Portal>
