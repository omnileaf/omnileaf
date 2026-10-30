<script lang="ts">
  import { X } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { stacksWhenCrowded } from "./info-bar-layout";
  import type { InfoBarSeverity } from "./info-bar-severity";
  import type { NoticeAction } from "./notices";

  const CLOSE_ICON_SIZE = 16;

  const FILLS = {
    informational: "bg-native-info-bar",
    success: "bg-native-info-bar-success",
    warning: "bg-native-info-bar-warning",
    error: "bg-native-info-bar-error",
  } satisfies Record<InfoBarSeverity, string>;

  const ICON_INKS = {
    informational: "*:text-native-info-bar-icon",
    success: "*:text-native-info-bar-success-icon",
    warning: "*:text-native-info-bar-warning-icon",
    error: "*:text-native-info-bar-error-icon",
  } satisfies Record<InfoBarSeverity, string>;

  let {
    severity,
    icon,
    title,
    body,
    action,
    shortcut,
    children,
    actions,
    onDismiss,
  }: {
    severity: InfoBarSeverity;
    icon: Snippet;
    title: string | Snippet;
    body?: string | undefined;
    action?: NoticeAction | undefined;
    shortcut?: { readonly label: string; readonly keys: string } | undefined;
    children?: Snippet | undefined;
    actions?: Snippet | undefined;
    onDismiss: () => void;
  } = $props();

  const hasActions = $derived(action !== undefined || actions !== undefined);
</script>

<div
  {@attach stacksWhenCrowded}
  data-severity={severity}
  class={[
    "group/bar relative flex items-start gap-x-md rounded-native-info-bar border border-native-info-bar-edge ps-lg pe-native-info-bar-end font-ui text-label text-native-on-info-bar min-block-native-info-bar data-stacked:flex-wrap",
    "group-data-floating/info-bars:rounded-native-info-bar-floating group-data-floating/info-bars:border-native-info-bar-floating-edge group-data-floating/info-bars:bg-native-info-bar-floating group-data-floating/info-bars:shadow-native-info-bar-floating-lift group-data-floating/info-bars:backdrop-blur-native-info-bar-floating",
    FILLS[severity],
  ]}
>
  <span
    aria-hidden="true"
    class={[
      "me-2xs mbs-lg flex shrink-0 *:block-lg *:inline-lg",
      ICON_INKS[severity],
    ]}
  >
    {@render icon()}
  </span>
  <div
    data-info-bar-words
    class={[
      "flex gap-x-md py-native-info-bar-words-block whitespace-nowrap min-inline-none",
      "group-data-stacked/bar:flex-1 group-data-stacked/bar:flex-col group-data-stacked/bar:gap-y-xs group-data-stacked/bar:whitespace-normal",
      !hasActions && "group-data-stacked/bar:pbe-native-info-bar-stacked-end",
      hasActions && "group-data-stacked/bar:pbe-none",
    ]}
  >
    <p class="font-semibold">
      {#if typeof title === "string"}
        {title}
      {:else}
        {@render title()}
      {/if}
    </p>
    {#if body !== undefined}
      <p class="font-regular">{body}</p>
    {/if}
    {@render children?.()}
  </div>
  {#if hasActions}
    <div
      class="my-sm ms-auto flex shrink-0 items-center gap-sm group-data-stacked/bar:my-none group-data-stacked/bar:basis-full group-data-stacked/bar:ps-native-info-bar-stacked-indent group-data-stacked/bar:pbs-md group-data-stacked/bar:pbe-native-info-bar-stacked-end"
    >
      {#if action !== undefined}
        {@const shown = action}
        <Tooltip
          label={shortcut === undefined ? undefined : shown.label}
          keys={shortcut === undefined ? [] : [shortcut.label]}
        >
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="secondary"
              aria-keyshortcuts={shortcut?.keys}
              onclick={() => {
                onDismiss();
                shown.run();
              }}
            >
              {shown.label}
            </Button>
          {/snippet}
        </Tooltip>
      {/if}
      {@render actions?.()}
    </div>
  {/if}
  <Button
    variant="plain"
    iconOnly
    label={m.notice_dismiss()}
    class="absolute inset-e-native-info-bar-close-inset inset-bs-native-info-bar-close-inset block-native-info-bar-close inline-native-info-bar-close"
    onclick={onDismiss}
  >
    <X aria-hidden="true" size={CLOSE_ICON_SIZE} />
  </Button>
</div>
