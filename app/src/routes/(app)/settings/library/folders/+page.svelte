<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import FolderGuide from "#lib/settings/FolderGuide.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
</script>

<SectionHeading
  title={m.folder_guide_title()}
  parent={{ route: "/(app)/settings/library", title: m.library_title() }}
/>
<FolderGuide class="mbs-pane-gap android:max-medium:mbs-none" />
