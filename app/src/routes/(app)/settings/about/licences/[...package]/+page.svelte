<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const licensed = $derived(data.licensed);
</script>

<SectionHeading
  title={licensed.name}
  parent={{
    route: "/(app)/settings/about/licences",
    title: m.about_licences(),
  }}
/>
<div class="mbs-pane-gap flex flex-col gap-xl two-pane:max-inline-section">
  <p class="text-label text-muted touch:max-medium:px-xs">
    {m.licence_summary({
      version: licensed.version,
      licence: licensed.licence,
    })}
  </p>
  {#each licensed.texts as licence, index (index)}
    <section class="flex flex-col gap-sm">
      <h2
        translate="no"
        class="text-footnote font-semibold text-muted touch:max-medium:px-xs"
      >
        {licence.licence}
      </h2>
      <p
        lang="en"
        dir="ltr"
        class="rounded-list border border-border bg-card p-lg text-footnote wrap-break-word whitespace-pre-wrap select-text"
      >
        {licence.text}
      </p>
    </section>
  {/each}
</div>
