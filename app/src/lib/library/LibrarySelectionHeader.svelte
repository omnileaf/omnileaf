<script lang="ts">
  import { SquareCheck, X } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { commandBarLook } from "#lib/page/command-bar-look.ts";
  import { isPhone, isPointer, usesCommandKey } from "#lib/page/platform.ts";
  import { foldingBarLook, NATIVE_TOP_BAR } from "#lib/page/top-bar.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { SelectionAction } from "./selection-actions.ts";

  const ICON_SIZE = 20;

  let {
    platform,
    count,
    onSelectAll,
    onCancel,
    actions = [],
  }: {
    platform: Platform;
    count: number;
    onSelectAll: () => void;
    onCancel: () => void;
    actions?: readonly SelectionAction[];
  } = $props();

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(platform, width.current));
  const onIosPhone = $derived(platform === "ios" && onPhone);
  const onIosTablet = $derived(platform === "ios" && !onPhone);
  const onAndroidPhone = $derived(platform === "android" && onPhone);
  const selectAll: Snippet = selectAllButton;
  const done: Snippet = doneButton;
  const bar = $derived(commandBarLook(platform));
  const selectAllKeys = $derived(
    usesCommandKey(platform) ? "Meta+A" : "Control+A",
  );
</script>

{#snippet selectAllButton()}
  <Button
    type="button"
    look="bar-button"
    aria-keyshortcuts={selectAllKeys}
    class="px-md whitespace-nowrap text-foreground inline-auto min-inline-native-target"
    onclick={onSelectAll}
  >
    {m.library_select_all()}
  </Button>
{/snippet}

{#snippet doneButton()}
  <Button
    type="button"
    look="bar-button"
    aria-keyshortcuts="Escape"
    class="bg-native-button-primary px-md whitespace-nowrap text-native-on-button-primary shadow-none inline-auto min-inline-native-target ios:backdrop-blur-none"
    onclick={onCancel}
  >
    {m.library_selection_done()}
  </Button>
{/snippet}

<h1 class="sr-only">{m.library_title()}</h1>
<div
  data-page-toolbar
  data-picking-bar={onIosPhone || undefined}
  class={[
    "sticky -inset-bs-page-top z-series-bar -ms-page-start -me-page-end -mbs-page-top flex items-center bg-background ps-page-start pe-page-end pbs-page-top pbe-xs in-toolbar:-inset-bs-title-gap in-toolbar:-ms-gutter in-toolbar:-mbs-title-gap in-toolbar:border-be in-toolbar:border-border in-toolbar:px-lg in-toolbar:pbs-none in-toolbar:pbe-none in-toolbar:min-block-toolbar",
    onIosTablet ? "flex-wrap justify-between" : "gap-sm",
  ]}
>
  {#if onIosPhone}
    {@render selectAll()}
    <p
      class="flex-1 truncate min-inline-none {foldingBarLook(platform)
        .title} {NATIVE_TOP_BAR.barTitle}"
      aria-live="polite"
    >
      {m.library_selected_series({ count })}
    </p>
    {@render done()}
  {:else if onIosTablet}
    {@render selectAll()}
    <p
      class="order-last pbs-native-large-title-above pbe-native-large-title-below inline-full {NATIVE_TOP_BAR.largeTitle}"
      aria-live="polite"
    >
      <span class="truncate min-inline-none">
        {m.library_selected_series({ count })}
      </span>
    </p>
    {@render done()}
  {:else}
    <Tooltip
      label={m.library_cancel_selecting()}
      type="button"
      aria-label={m.library_cancel_selecting()}
      aria-keyshortcuts="Escape"
      onclick={onCancel}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look={onPhone ? "header-control" : "icon"}
          class={onPhone
            ? undefined
            : "block-touch-target inline-touch-target in-toolbar:block-pointer-button in-toolbar:inline-pointer-button"}
        >
          <X size={ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
    <p
      class={[
        "flex-1",
        onAndroidPhone
          ? "text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title"
          : (bar?.title ?? "text-title font-semibold in-toolbar:text-body"),
      ]}
      aria-live="polite"
    >
      {m.library_selected_series({ count })}
    </p>
    {#if bar === undefined}
      <Button
        type="button"
        {...onPhone ? { variant: "plain" } : { look: "text" }}
        aria-keyshortcuts={selectAllKeys}
        class={onPhone
          ? undefined
          : "flex items-center gap-sm px-xs text-body min-block-touch-target in-toolbar:text-small in-toolbar:min-block-pointer-button"}
        onclick={onSelectAll}
      >
        {m.library_select_all()}
        {#if isPointer(platform)}
          <Kbd>
            {usesCommandKey(platform)
              ? m.library_select_all_command()
              : m.library_select_all_control()}
          </Kbd>
        {/if}
      </Button>
    {:else}
      <div
        role="group"
        aria-label={m.library_selection_toolbar()}
        class="flex items-center"
      >
        <Tooltip
          label={m.library_select_all()}
          keys={[m.library_select_all_control()]}
          type="button"
          aria-keyshortcuts={selectAllKeys}
          onclick={onSelectAll}
        >
          {#snippet child({ props })}
            <Button {...props} look={bar.look}>
              <SquareCheck
                size={ICON_SIZE}
                aria-hidden="true"
                class={bar.icon}
              />
              <span class={bar.label}>{m.library_select_all()}</span>
            </Button>
          {/snippet}
        </Tooltip>
        {#each actions as { name, icon: Icon, label, act } (name)}
          <Button
            type="button"
            look={bar.look}
            disabled={count === 0}
            onclick={act}
          >
            <Icon size={ICON_SIZE} aria-hidden="true" class={bar.icon} />
            <span class={bar.label}>{label}</span>
          </Button>
        {/each}
      </div>
    {/if}
  {/if}
</div>
