<script lang="ts">
  import { CircleAlert, Copy, Globe, Save } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import CardWayRow from "./CardWayRow.svelte";
  import FlushWayRow from "./FlushWayRow.svelte";
  import type { WayRowProps } from "./report-row-props.ts";
  import {
    CurrentReportRowsLook,
    REPORT_HEADINGS,
    REPORT_LISTS,
    type ReportRowsLook,
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

  const WAY_ROWS = {
    flush: FlushWayRow,
    card: CardWayRow,
  } satisfies Record<ReportRowsLook, Component<WayRowProps>>;

  let { sharing, canSave }: { sharing: ReportSharing; canSave: boolean } =
    $props();

  const ways = $derived(canSave ? [...SHARING, SAVING] : SHARING);
  const failure = $derived(
    sharing.failure?.way === "send" ? undefined : sharing.failure,
  );

  const headingId = $props.id();
  const rowsLook = new CurrentReportRowsLook();
  const WayRow = $derived(WAY_ROWS[rowsLook.current]);

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
    {#each ways as { way, icon, iconName, label, opensBrowser } (way)}
      <li>
        <WayRow
          {icon}
          {iconName}
          label={label()}
          {opensBrowser}
          onPress={() => {
            shareBy(way);
          }}
        />
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
