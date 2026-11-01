<script lang="ts">
  import type { LucideIcon } from "@lucide/svelte";

  import { currentPlatform } from "#lib/page/platform.ts";

  import { usesSetupPages } from "./setup-pages.ts";

  let { icon: Icon }: { icon: LucideIcon } = $props();

  const isSetupPage = usesSetupPages(currentPlatform());
</script>

<span
  aria-hidden="true"
  class={[
    "flex items-center justify-center",
    isSetupPage
      ? "pbe-xs text-windows-accent block-setup-hero-icon inline-setup-hero-icon"
      : "rounded-full bg-step-tint text-accent block-step-badge inline-step-badge android:rounded-none android:bg-transparent android:text-native-on-button-plain android:block-android-hero-icon android:inline-android-hero-icon",
  ]}
>
  <Icon
    class={isSetupPage
      ? "block-setup-hero-icon inline-setup-hero-icon"
      : "block-step-badge-icon inline-step-badge-icon android:block-android-hero-icon android:inline-android-hero-icon"}
  />
</span>
