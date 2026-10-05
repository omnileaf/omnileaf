<script lang="ts">
  import { groupByLicence } from "$lib/licences/licences";
  import LicenceGroupList from "$lib/licences/LicenceGroupList.svelte";
  import { WindowWidth } from "$lib/page/breakpoints";
  import { isPhone } from "$lib/page/platform";
  import { m } from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";

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
  parent={{ route: "/settings/about", title: m.about_title() }}
/>
<div
  class="mbs-pane-gap flex flex-col gap-pane-gap two-pane:max-inline-section"
>
  <p class="text-label text-muted touch:max-medium:px-xs">
    {m.licences_intro({ count: data.packages.length })}
  </p>
  {#each groups as group (group.name)}
    <LicenceGroupList {group} {look} />
  {/each}
</div>
