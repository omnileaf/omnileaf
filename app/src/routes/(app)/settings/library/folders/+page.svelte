<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import FolderGuide from "#lib/settings/FolderGuide.svelte";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
</script>

<GroupedGround>
  <SectionHeading
    title={m.folder_guide_title()}
    parent={{ route: "/(app)/settings/library", title: m.library_title() }}
    androidTitle="in-bar"
  />
  <FolderGuide class="mbs-pane-gap android:mbs-none" />
</GroupedGround>
