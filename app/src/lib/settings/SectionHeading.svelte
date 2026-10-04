<script lang="ts">
  import { ArrowLeft, ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import { m } from "$lib/paraglide/messages.js";

  let { title }: { title: string } = $props();

  const ARROW_SIZE = 24;
  const PHONE_CHEVRON_SIZE = 22;
  const POINTER_CHEVRON_SIZE = 16;
</script>

<header
  class="flex flex-col items-start android:max-medium:-ms-md android:max-medium:flex-row android:max-medium:items-center android:max-medium:gap-xs touch:max-medium:-mbs-sm touch:medium:max-expanded:-mbs-lg desktop:max-medium:-mbs-md"
>
  <a
    href={resolve("/settings")}
    aria-label={m.back_to({ page: m.settings_title() })}
    class={[
      "flex shrink-0 items-center gap-2xs two-pane:hidden",
      "desktop:-ms-xs desktop:rounded-control desktop:ps-2xs desktop:pe-sm desktop:text-label desktop:font-semibold desktop:text-accent desktop:block-2xl",
      "ios:max-medium:-ms-xs ios:max-medium:px-sm ios:max-medium:text-back-link ios:max-medium:font-medium ios:max-medium:text-accent ios:max-medium:min-block-touch-target",
      "android:justify-center android:rounded-full android:block-touch-target android:inline-touch-target",
      "ios:medium:justify-center ios:medium:rounded-full ios:medium:block-touch-target ios:medium:inline-touch-target",
      "touch:medium:-ms-md",
    ]}
  >
    <ArrowLeft
      size={ARROW_SIZE}
      class="hidden rtl:-scale-x-100 ios:medium:block android:block"
    />
    <ChevronLeft
      size={PHONE_CHEVRON_SIZE}
      class="hidden rtl:-scale-x-100 ios:max-medium:block"
    />
    <ChevronLeft
      size={POINTER_CHEVRON_SIZE}
      class="hidden rtl:-scale-x-100 desktop:block"
    />
    <span class="ios:medium:hidden android:hidden">{m.settings_title()}</span>
  </a>
  <h1
    tabindex="-1"
    class={[
      "mbs-xs text-bar-title font-bold tracking-tight two-pane:mbs-none",
      "android:max-medium:mbs-none android:max-medium:font-semibold android:max-medium:tracking-normal",
      "ios:max-medium:ps-xs ios:max-medium:text-page-title",
      "touch:medium:max-expanded:text-page-title",
    ]}
  >
    {title}
  </h1>
</header>
