<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import FolderGuide from "#lib/settings/FolderGuide.svelte";

  import StepFrame from "./StepFrame.svelte";

  let { onBack }: { onBack: () => void } = $props();
</script>

<StepFrame title={m.folder_guide_title()} {onBack}>
  <FolderGuide />
</StepFrame>
