<script lang="ts">
  import { resolve } from "$app/paths";
  import { variantClasses } from "#lib/components/ui/button/looks.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { backIcon } from "#lib/page/top-bar.ts";
  import { m } from "#lib/paraglide/messages.js";

  let {
    title,
    status,
  }: { title: string | undefined; status: string | undefined } = $props();
</script>

<div class="flex flex-1 items-center gap-sm min-inline-none">
  <Tooltip label={m.series_back_label()} aria-label={m.series_back_label()}>
    {#snippet child({ props })}
      <a
        {...props}
        href={resolve("/(app)")}
        data-back-link
        class={variantClasses("plain", "regular", true, "macos")}
      >
        <Icon name={backIcon("macos")} />
      </a>
    {/snippet}
  </Tooltip>
  <div class="flex flex-col min-inline-none">
    <span
      data-title-bar-title
      aria-hidden="true"
      class="truncate text-native-title-bar-title/native-title-bar-title font-native-title-bar-title tracking-native-title-bar-title text-foreground"
    >
      {title}
    </span>
    <span
      role="status"
      class="truncate text-native-title-bar-status/native-title-bar-status font-native-title-bar-status text-muted"
      >{status ?? ""}</span
    >
  </div>
  <div data-title-bar-actions class="ms-auto flex items-center"></div>
</div>
