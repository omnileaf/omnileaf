<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Toggle } from "#lib/components/ui/toggle/index.ts";
  import { ANDROID_FILTER_CHIP } from "#lib/library/filter-sheet-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SEARCH_SCOPES, type SearchScope } from "./search-query.svelte";

  const CHECK_SIZE = 16;
  const NATIVE_CHIP =
    "snap-start border-0 bg-native-button-outline text-native-button/native-button font-native-button tracking-native-button block-auto min-block-native-segment touch:touch-target-around aria-pressed:bg-native-accent-soft aria-pressed:font-native-segment-selected";
  const NATIVE_GROUP =
    "flex-nowrap snap-x gap-sm overflow-x-auto py-sm scrollbar-none";

  const LABELS = {
    everything: m.search_everything,
    manga: m.search_scope_manga,
    book: m.search_scope_books,
  } satisfies Record<SearchScope, () => string>;

  let {
    scope,
    onNarrow,
    class: className,
  }: {
    scope: SearchScope;
    onNarrow: (scope: SearchScope) => void;
    class?: ClassValue;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const phone = $derived(phoneOf(platform, width.current));
  const isNative = $derived(phone === "ios");
  const isMaterial = $derived(phone === "android");

  let row: HTMLElement | undefined = $state();

  function revealSideways(strip: HTMLElement, chip: Element): void {
    const stripBox = strip.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    if (chipBox.left < stripBox.left) {
      strip.scrollBy({ left: chipBox.left - stripBox.left });
    } else if (chipBox.right > stripBox.right) {
      strip.scrollBy({ left: chipBox.right - stripBox.right });
    }
  }

  $effect(() => {
    const chip = row?.querySelector(`[data-scope="${scope}"]`);
    if (row !== undefined && chip !== null && chip !== undefined) {
      revealSideways(row, chip);
    }
  });
</script>

<div
  bind:this={row}
  role="group"
  aria-label={m.search_scope()}
  class={[
    "flex shrink-0",
    isNative || isMaterial ? NATIVE_GROUP : "flex-wrap gap-x-icon-gap gap-y-lg",
    className,
  ]}
>
  {#each SEARCH_SCOPES as choice (choice)}
    {@const isChosen = scope === choice}
    <Toggle
      bind:pressed={
        () => isChosen,
        () => {
          onNarrow(choice);
        }
      }
      data-scope={choice}
      class={isMaterial
        ? [
            ANDROID_FILTER_CHIP.chip,
            "snap-start",
            isChosen
              ? [
                  ANDROID_FILTER_CHIP.chosen,
                  "aria-pressed:border-transparent aria-pressed:bg-native-accent-soft aria-pressed:font-native-button",
                ]
              : ANDROID_FILTER_CHIP.other,
          ]
        : isNative
          ? NATIVE_CHIP
          : undefined}
    >
      <span class="flex items-center gap-xs">
        {#if isChosen}
          <Check size={CHECK_SIZE} aria-hidden="true" />
        {/if}
        {LABELS[choice]()}
      </span>
    </Toggle>
  {/each}
</div>
