<script lang="ts">
  import { CopyButton } from "#lib/components/ui/copy-button/index.ts";
  import type { DetailsCopying } from "#lib/copying/details-copying.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { type AboutLook, ROW_ICON_SIZES } from "./look";

  let { copying, look }: { copying: DetailsCopying; look: AboutLook } =
    $props();
</script>

<CopyButton
  {copying}
  look="about-copy"
  iconSize={ROW_ICON_SIZES[look]}
  hidesLabel
  labels={{
    copy: m.about_copy_version_details(),
    copied: m.about_version_details_copied(),
    copiedStatus: m.about_version_details_copied_status(),
  }}
/>
