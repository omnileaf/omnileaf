<script lang="ts">
  import { CircleAlert, Copy, ExternalLink, Globe, Save } from "@lucide/svelte";

  import { Alert, AlertTitle } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { ReportSharing, ShareWay } from "./report-sharing.svelte";
  import { failureMessage } from "./share-failure";

  const ICON_SIZE = 16;

  interface Way {
    readonly way: ShareWay;
    readonly icon: Glyph;
    readonly label: () => string;
    readonly opensBrowser: boolean;
  }

  const SHARING: readonly Way[] = [
    {
      way: "github",
      icon: Globe,
      label: m.report_open_on_github,
      opensBrowser: true,
    },
    { way: "copy", icon: Copy, label: m.report_copy, opensBrowser: false },
  ];
  const SAVING: Way = {
    way: "save",
    icon: Save,
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
</script>

<section aria-labelledby={headingId} class="mbs-lg flex flex-col">
  <h2 id={headingId} class="mbe-ways-heading-gap text-small font-semibold">
    {m.report_other_ways_to_send()}
  </h2>
  <ul
    class="flex flex-col divide-y divide-border overflow-hidden rounded-card border border-border bg-card android:rounded-android-md android:border-transparent android:bg-android-container-low"
  >
    {#each ways as { way, icon: Icon, label, opensBrowser } (way)}
      <li>
        <Button
          type="button"
          look="row"
          class="gap-md px-lg py-md inline-full min-block-touch-target focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
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
      </li>
    {/each}
  </ul>
  <div role="alert">
    {#if failure !== undefined}
      <Alert tone="warning" icon={CircleAlert} class="mbs-sm">
        <AlertTitle>{failureMessage(failure)}</AlertTitle>
      </Alert>
    {/if}
  </div>
</section>
