<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import NotesSections from "#lib/whats-new/NotesSections.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<SectionHeading
  title={m.whats_new_title()}
  parent={{ route: "/(app)/settings/about", title: m.about_title() }}
/>
<div
  class="mbs-pane-gap flex flex-col android:max-medium:mbs-none two-pane:max-inline-section"
>
  <NotesSections notes={data.installed} />
</div>
