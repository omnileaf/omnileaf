<script lang="ts">
  import { groupByLicence } from "#lib/licences/licences.ts";
  import LicenceGroupList from "#lib/licences/LicenceGroupList.svelte";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const width = new WindowWidth();
  const look = $derived(
    isPhone(data.appInfo.platform, width.current) ? "phone" : "pane",
  );
  const groups = $derived(
    groupByLicence(data.packages, new Intl.Collator(getLocale())),
  );
</script>

<SectionHeading
  title={m.about_licences()}
  parent={{ route: "/(app)/settings/about", title: m.about_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm two-pane:max-inline-section">
  <p class="text-detail text-muted">{m.licences_intro()}</p>
  <div class="flex flex-col gap-xl">
    {#each groups as group (group.name)}
      <LicenceGroupList {group} {look} />
    {/each}
  </div>
</div>
