<script lang="ts">
  import { CircleAlert, Copy, ExternalLink, Globe, Save } from "@lucide/svelte";

  import AboutButtonRow from "#lib/about/AboutButtonRow.svelte";
  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    CurrentReportRowsLook,
    ICON_TILE,
    REPORT_HEADINGS,
    REPORT_LISTS,
    TILE_ICON_SIZE,
  } from "./report-rows-look.ts";
  import type { ReportSharing, ShareWay } from "./report-sharing.svelte";
  import { failureMessage } from "./share-failure";

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
  const rowsLook = new CurrentReportRowsLook();

  function shareBy(way: ShareWay): void {
    void sharing.share(way);
  }
</script>

<section
  data-settings-group
  aria-labelledby={headingId}
  class="mbs-lg flex flex-col"
>
  <h2 id={headingId} class={REPORT_HEADINGS[rowsLook.current]}>
    {m.report_other_ways_to_send()}
  </h2>
  <ul class={REPORT_LISTS[rowsLook.current]}>
    {#each ways as { way, icon: Icon, iconName, label, opensBrowser } (way)}
      <li>
        {#if rowsLook.current === "flush"}
          <AboutButtonRow
            icon={Icon}
            {iconName}
            label={label()}
            look="android"
            class={ROW_FOCUS_RING}
            {opensBrowser}
            onPress={() => {
              shareBy(way);
            }}
          />
        {:else}
          <Button
            type="button"
            look="row"
            class={[
              "gap-md px-lg py-md inline-full min-block-touch-target",
              ROW_FOCUS_RING,
            ]}
            onclick={() => {
              shareBy(way);
            }}
          >
            <span aria-hidden="true" class={ICON_TILE}>
              <Icon size={TILE_ICON_SIZE} />
            </span>
            <span class="flex-1 font-medium expanded:font-semibold"
              >{label()}</span
            >
            {#if opensBrowser}
              <ExternalLink
                role="img"
                aria-label={m.about_opens_in_browser()}
                size={TILE_ICON_SIZE}
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
