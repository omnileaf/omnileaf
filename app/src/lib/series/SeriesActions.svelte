<script lang="ts">
  import { BookOpen, ChevronDown, Eye, EyeOff, Tag } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { variantClasses } from "#lib/components/ui/button/looks.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type {
    Platform,
    ReadMark,
    SeriesOverview,
  } from "#lib/ipc/bindings.ts";
  import { phoneAction } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoonControl from "./ComingSoonControl.svelte";
  import { SERIES_CONTROL } from "./series-control.ts";

  const ICON_SIZE = 16;

  interface PhoneLayout {
    readonly row: string;
    readonly state: string;
    readonly stateChevron: IconName;
    readonly chevron: string;
  }

  const PHONE_LAYOUTS: Readonly<Record<Platform, PhoneLayout | undefined>> = {
    ios: {
      row: "flex flex-wrap items-center justify-center gap-md",
      state: "min-inline-none max-inline-full",
      stateChevron: "chevrons-up-down",
      chevron: "",
    },
    android: {
      row: "flex items-center gap-sm",
      state: "flex-1 justify-start min-inline-none",
      stateChevron: "chevron-down",
      chevron: "ms-auto",
    },
    linux: undefined,
    macos: undefined,
    windows: undefined,
  };

  let {
    overview,
    isWide,
    onMarkAll,
  }: {
    overview: SeriesOverview;
    isWide: boolean;
    onMarkAll: (mark: ReadMark) => Promise<void>;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const phone = $derived.by(() => {
    const other = phoneAction(platform, width.current, "other");
    const layout = PHONE_LAYOUTS[platform];
    return other === undefined || layout === undefined
      ? undefined
      : { ...layout, other: other.variant };
  });
  const isAllRead = $derived(overview.readCount === overview.bookCount);
  const state = $derived.by(() => {
    if (isAllRead) {
      return m.series_state_read();
    }
    return overview.readCount > 0 ||
      overview.upNext?.reading.state === "started"
      ? m.series_state_reading()
      : m.series_state_unread();
  });
  const markLabel = $derived.by(() => {
    if (isWide) {
      return isAllRead ? m.series_mark_unread() : m.series_mark_read();
    }
    const title = overview.title;
    return isAllRead
      ? m.series_mark_series_unread({ title })
      : m.series_mark_series_read({ title });
  });
</script>

{#if phone !== undefined}
  <div class={phone.row}>
    <ComingSoonControl
      label={m.series_reading_state({ state })}
      class={cn(
        variantClasses("secondary", "regular", false, platform),
        phone.state,
      )}
    >
      <Icon name="book-open" class="shrink-0" />
      <span class="truncate min-inline-none">{state}</span>
      <Icon name={phone.stateChevron} class={cn("shrink-0", phone.chevron)} />
    </ComingSoonControl>
    <ComingSoonControl
      label={m.series_tags_for({ title: overview.title })}
      class={variantClasses(phone.other, "regular", true, platform)}
    >
      <Icon name="tag" />
    </ComingSoonControl>
    <Button
      type="button"
      variant={phone.other}
      iconOnly
      label={markLabel}
      onClickPromise={() => onMarkAll(isAllRead ? "unread" : "read")}
    >
      <Icon name={isAllRead ? "eye-off" : "eye"} />
    </Button>
  </div>
{:else}
  <div class="flex gap-sm @series-split:flex-col">
    <ComingSoonControl
      label={m.series_reading_state({ state })}
      class={cn(
        SERIES_CONTROL,
        "flex-1 justify-between rounded-shadcn-control font-regular text-foreground min-inline-none",
      )}
    >
      <span class="flex items-center gap-sm min-inline-none">
        <BookOpen size={ICON_SIZE} aria-hidden="true" />
        <span class="truncate">{state}</span>
      </span>
      <ChevronDown size={ICON_SIZE} aria-hidden="true" class="opacity-50" />
    </ComingSoonControl>
    <div class="flex gap-sm">
      <ComingSoonControl
        label={isWide
          ? m.series_tags()
          : m.series_tags_for({ title: overview.title })}
        class={cn(
          SERIES_CONTROL,
          "inline-touch-target max-expanded:px-none expanded:inline-auto @series-split:flex-1",
        )}
      >
        <Tag size={ICON_SIZE} aria-hidden="true" />
        {#if isWide}
          {m.series_tags()}
        {/if}
      </ComingSoonControl>
      <Button
        type="button"
        look="outline"
        aria-label={markLabel}
        class={cn(
          SERIES_CONTROL,
          "inline-touch-target max-expanded:px-none expanded:inline-auto @series-split:flex-1",
        )}
        onClickPromise={() => onMarkAll(isAllRead ? "unread" : "read")}
      >
        {#if isAllRead}
          <EyeOff size={ICON_SIZE} aria-hidden="true" />
        {:else}
          <Eye size={ICON_SIZE} aria-hidden="true" />
        {/if}
        {#if isWide}
          {markLabel}
        {/if}
      </Button>
    </div>
  </div>
{/if}
