<script lang="ts">
  import { Icon } from "#lib/components/ui/icon/index.ts";

  type ChevronPlatforms = "platform" | "everywhere";

  let { shownOn = "platform" }: { readonly shownOn?: ChevronPlatforms } =
    $props();
</script>

<Icon
  name="chevron-right"
  class={[
    "shrink-0 text-muted rtl:-scale-x-100",
    shownOn === "platform" && "android:hidden",
  ]}
/>
