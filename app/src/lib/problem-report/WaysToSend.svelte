<script lang="ts">
  import { CircleAlert, Copy, ExternalLink, Globe, Save } from "@lucide/svelte";

  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import RowText from "#lib/about/RowText.svelte";
  import { ROW_ICON_SIZES } from "#lib/about/look.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Item } from "#lib/components/ui/item/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    FLUSH_LIST,
    FLUSH_LIST_HEADING,
  } from "#lib/settings/android-flush-look.ts";

  import type { ReportSharing, ShareWay } from "./report-sharing.svelte";
  import { failureMessage } from "./share-failure";

  const ICON_SIZE = 16;

  interface Way {
    readonly way: ShareWay;
    readonly icon: Glyph;
    readonly iconName: IconName;
    readonly label: () => string;
    readonly opensBrowser: boolean;
  }

  const SHARING: readonly Way[] = [
    {
      way: "github",
      icon: Globe,
      iconName: "globe",
      label: m.report_open_on_github,
      opensBrowser: true,
    },
    {
      way: "copy",
      icon: Copy,
      iconName: "copy",
      label: m.report_copy,
      opensBrowser: false,
    },
  ];
  const SAVING: Way = {
    way: "save",
    icon: Save,
    iconName: "save",
    label: m.report_save,
    opensBrowser: false,
  };

  let { sharing, canSave }: { sharing: ReportSharing; canSave: boolean } =
    $props();

  const ways = $derived(canSave ? [...SHARING, SAVING] : SHARING);
  const failure = $derived(
    sharing.failure?.way === "send" ? undefined : sharing.failure,
  );

  const headingId = $props.id();
  const android = new AndroidPhone();
</script>

<section
  data-settings-group
  aria-labelledby={headingId}
  class="mbs-lg flex flex-col"
>
  <h2
    id={headingId}
    class={android.isOn
      ? FLUSH_LIST_HEADING
      : "mbe-ways-heading-gap text-small font-semibold"}
  >
    {m.report_other_ways_to_send()}
  </h2>
  <ul
    class={android.isOn
      ? FLUSH_LIST
      : [
          "flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card",
          GROUP_PLATE,
        ]}
  >
    {#each ways as { way, icon: Icon, iconName, label, opensBrowser } (way)}
      <li>
        {#if android.isOn}
          <Item look="row">
            {#snippet child({ props })}
              <Button
                {...props}
                type="button"
                look="row"
                onclick={() => {
                  void sharing.share(way);
                }}
              >
                <RowText
                  icon={Icon}
                  {iconName}
                  label={label()}
                  hint={undefined}
                  look="android"
                />
                {#if opensBrowser}
                  <ExternalLink
                    role="img"
                    aria-label={m.about_opens_in_browser()}
                    size={ROW_ICON_SIZES.android}
                    class="shrink-0 text-muted"
                  />
                {/if}
              </Button>
            {/snippet}
          </Item>
        {:else}
          <Button
            type="button"
            look="row"
            class={[
              "gap-md px-lg py-md inline-full min-block-touch-target",
              ROW_FOCUS_RING,
            ]}
            onclick={() => {
              void sharing.share(way);
            }}
          >
            <span
              aria-hidden="true"
              class="flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile"
            >
              <Icon size={ICON_SIZE} />
            </span>
            <span class="flex-1 font-medium expanded:font-semibold"
              >{label()}</span
            >
            {#if opensBrowser}
              <ExternalLink
                role="img"
                aria-label={m.about_opens_in_browser()}
                size={ICON_SIZE}
                class="shrink-0 text-muted"
              />
            {/if}
          </Button>
        {/if}
      </li>
    {/each}
  </ul>
  <div role="alert">
    {#if failure !== undefined}
      <Alert
        tone="warning"
        icon={CircleAlert}
        iconName="circle-alert"
        class="mbs-sm"
      >
        <AlertTitle>{failureMessage(failure)}</AlertTitle>
      </Alert>
    {/if}
  </div>
</section>
