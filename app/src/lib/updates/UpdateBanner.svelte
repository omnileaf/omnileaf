<script lang="ts">
  import { CircleAlert, Download, EyeOff } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { NewerRelease } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { UpdateCheck } from "./update-check.svelte.ts";

  const ICON_SIZE = 16;
  const MORE_BUTTON =
    "absolute inset-e-xs inset-bs-xs block-native-button inline-native-button";

  let {
    checking,
    release,
    class: className,
  }: {
    checking: UpdateCheck;
    release: NewerRelease;
    class?: ClassValue;
  } = $props();

  const titleId = $props.id();
</script>

<div class={className}>
  <Alert
    tone="plain"
    icon={Download}
    iconName="download"
    role="status"
    aria-labelledby={titleId}
  >
    <AlertTitle id={titleId}
      >{m.about_update_available({ version: release.version })}</AlertTitle
    >
    {#if release.headline !== null}
      <AlertDescription class="line-clamp-2"
        >{release.headline}</AlertDescription
      >
    {/if}
    <AlertActions>
      <Button
        type="button"
        variant="plain"
        onclick={() => {
          void checking.openReleasePage();
        }}>{m.update_banner_view_release()}</Button
      >
      <Button
        type="button"
        variant="plain"
        onclick={() => {
          void checking.snooze(release.version);
        }}>{m.update_banner_not_now()}</Button
      >
    </AlertActions>
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="plain"
            iconOnly
            label={m.update_banner_more()}
            data-alert-dismiss
            class={MORE_BUTTON}
          >
            <Icon name="ellipsis" />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent to="main" align="end">
        <DropdownMenuItem
          onSelect={() => {
            void checking.skip(release.version);
          }}
        >
          <EyeOff size={ICON_SIZE} aria-hidden="true" />
          {m.update_banner_skip()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </Alert>
  {#if checking.hasOpeningFailed}
    <Alert
      tone="warning"
      icon={CircleAlert}
      iconName="circle-alert"
      role="alert"
      class="mbs-sm"
    >
      <AlertTitle>{m.about_browser_unavailable()}</AlertTitle>
    </Alert>
  {/if}
</div>
