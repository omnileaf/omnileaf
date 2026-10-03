<script lang="ts">
  import NavigationIcon from "$lib/navigation/NavigationIcon.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import AddFolderButton from "./AddFolderButton.svelte";
  import type { FolderAdding } from "./folder-adding.svelte";

  const ART_ICON_SIZE = 28;

  let { adding }: { adding: FolderAdding } = $props();

  const titleId = $props.id();
</script>

<section
  aria-labelledby={titleId}
  class="flex flex-1 flex-col items-center justify-center gap-md px-lg pbe-empty-lift-phone text-center medium:px-none medium:pbe-empty-lift-tablet expanded:pbe-empty-lift-desktop"
>
  <span
    class="flex items-center justify-center rounded-full bg-accent-soft block-empty-art inline-empty-art medium:text-accent medium:block-empty-art-wide medium:inline-empty-art-wide"
  >
    <NavigationIcon
      section="library"
      isSelected={false}
      isArriving={false}
      size={ART_ICON_SIZE}
      class="medium:block-empty-icon-wide medium:inline-empty-icon-wide"
    />
  </span>
  <h2 id={titleId} class="mbs-sm text-title font-bold">
    {m.library_empty_title()}
  </h2>
  <p class="text-lead text-muted max-inline-empty-text">
    {m.library_empty_body()}
  </p>
  <AddFolderButton {adding} look="filled" class="mbs-sm" />
</section>
