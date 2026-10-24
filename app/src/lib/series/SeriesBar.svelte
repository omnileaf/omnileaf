<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { backIcon, NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { barChip } from "./series-chip.ts";
  import SeriesMenu from "./SeriesMenu.svelte";

  const BACK_ICON_SIZE = 20;

  let {
    title,
    isTitleUnderBar,
    height = $bindable(0),
    onMarkAll,
    onLabel,
    onEditDetails,
    showFolder,
  }: {
    title: string | undefined;
    isTitleUnderBar: boolean;
    height?: number;
    onMarkAll: ((mark: ReadMark) => Promise<void>) | undefined;
    onLabel: (() => void) | undefined;
    onEditDetails: (() => void) | undefined;
    showFolder: {
      readonly label: string;
      readonly onShow: (() => void) | undefined;
    };
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isNative = $derived(isPhone(platform, width.current));
  const TODAYS_SCROLLED =
    "border-border bg-background ios:border-ios-separator ios:bg-ios-material ios:backdrop-blur-ios";
  const TODAYS_TITLE = "text-body font-semibold";
</script>

<header
  bind:clientHeight={height}
  class={[
    "sticky -inset-bs-page-top z-series-bar -ms-page-start -me-page-end flex items-center gap-sm ps-series-bar-start pe-series-bar-end pbs-series-bar-top pbe-sm motion-safe:transition-colors motion-safe:duration-fade while-picking:invisible",
    isNative ? NATIVE_TOP_BAR.edge : "border-be",
    isTitleUnderBar
      ? isNative
        ? NATIVE_TOP_BAR.scrolled
        : TODAYS_SCROLLED
      : "border-transparent",
  ]}
>
  <a
    href={resolve("/(app)")}
    data-back-link
    aria-label={m.series_back_label()}
    class={cn(
      "flex items-center justify-center gap-2xs rounded-full",
      barChip(platform, width.current),
      "ios:ps-sm ios:pe-md ios:inline-auto",
    )}
  >
    {#if isNative}
      <Icon name={backIcon(platform)} class="shrink-0" />
    {:else}
      <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" class="shrink-0" />
    {/if}
    <span class="hidden text-body ios:inline">{m.series_back()}</span>
  </a>
  <span
    aria-hidden="true"
    class={[
      "flex-1 truncate motion-safe:transition-opacity motion-safe:duration-fade ios:text-center",
      isNative ? NATIVE_TOP_BAR.barTitle : TODAYS_TITLE,
      isTitleUnderBar ? "opacity-100" : "opacity-0",
    ]}
  >
    {title}
  </span>
  {#if title !== undefined && onMarkAll !== undefined}
    <SeriesMenu {title} {onMarkAll} {onLabel} {onEditDetails} {showFolder} />
  {/if}
</header>
