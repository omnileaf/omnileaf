<script lang="ts">
  import { SquareCheck, X } from "@lucide/svelte";

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
  const onAndroidPhone = $derived(platform === "android" && onPhone);
  const bar = $derived(commandBarLook(platform));
  const selectAllKeys = $derived(
    usesCommandKey(platform) ? "Meta+A" : "Control+A",
  );
</script>

<h1 class="sr-only">{m.library_title()}</h1>
<div
  data-page-toolbar
  class="sticky -inset-bs-page-top z-series-bar -ms-page-start -me-page-end -mbs-page-top flex items-center gap-sm bg-background ps-page-start pe-page-end pbs-page-top pbe-xs in-toolbar:-inset-bs-title-gap in-toolbar:-ms-gutter in-toolbar:-mbs-title-gap in-toolbar:border-be in-toolbar:border-border in-toolbar:px-lg in-toolbar:pbs-none in-toolbar:pbe-none in-toolbar:min-block-toolbar"
>
  {#if onIosPhone}
    <Button
      type="button"
      look="header-control"
      aria-keyshortcuts={usesCommandKey(platform) ? "Meta+A" : "Control+A"}
      class="px-md"
      onclick={onSelectAll}
    >
      {m.library_select_all()}
    </Button>
    <p
      class="flex-1 truncate min-inline-none {foldingBarLook(platform)
        .title} {NATIVE_TOP_BAR.barTitle}"
      aria-live="polite"
    >
      {m.library_selected_series({ count })}
    </p>
    <Button
      type="button"
      look="header-control"
      aria-keyshortcuts="Escape"
      class="bg-native-button-primary px-md text-native-on-button-primary shadow-none ios:backdrop-blur-none"
      onclick={onCancel}
    >
      {m.library_selection_done()}
    </Button>
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
      <Button
        type="button"
        look={bar.look}
        aria-keyshortcuts={selectAllKeys}
        onclick={onSelectAll}
      >
        <SquareCheck size={ICON_SIZE} aria-hidden="true" class={bar.icon} />
        <span class={bar.label}>{m.library_select_all()}</span>
      </Button>
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
    {/if}
  {/if}
</div>
