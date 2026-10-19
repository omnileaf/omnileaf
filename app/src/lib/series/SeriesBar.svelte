<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SERIES_CHIP } from "./series-chip.ts";
  import SeriesMenu from "./SeriesMenu.svelte";

  const BACK_ICON_SIZE = 20;

  let {
    title,
    isTitleUnderBar,
    height = $bindable(0),
    onMarkAll,
  }: {
    title: string | undefined;
    isTitleUnderBar: boolean;
    height?: number;
    onMarkAll: ((mark: ReadMark) => Promise<void>) | undefined;
  } = $props();
</script>

<header
  bind:clientHeight={height}
  class={[
    "sticky -inset-bs-page-top z-series-bar -ms-page-start -me-page-end flex items-center gap-sm border-be border-transparent ps-series-bar-start pe-series-bar-end pbs-series-bar-top pbe-sm motion-safe:transition-colors motion-safe:duration-fade while-picking:invisible",
    isTitleUnderBar &&
      "border-border bg-background ios:border-ios-separator ios:bg-ios-material ios:backdrop-blur-ios",
  ]}
>
  <a
    href={resolve("/(app)")}
    data-back-link
    aria-label={m.series_back_label()}
    class={cn(
      "flex items-center justify-center gap-2xs rounded-full",
      SERIES_CHIP,
      "ios:ps-sm ios:pe-md ios:inline-auto",
    )}
  >
    <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" class="shrink-0" />
    <span class="hidden text-body ios:inline">{m.series_back()}</span>
  </a>
  <span
    aria-hidden="true"
    class={[
      "flex-1 truncate text-body font-semibold motion-safe:transition-opacity motion-safe:duration-fade ios:text-center",
      isTitleUnderBar ? "opacity-100" : "opacity-0",
    ]}
  >
    {title}
  </span>
  {#if title !== undefined && onMarkAll !== undefined}
    <SeriesMenu {title} {onMarkAll} />
  {/if}
</header>
