<script lang="ts">
  import { ArrowLeft, ChevronLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import { m } from "$lib/paraglide/messages.js";

  let {
    title,
    parentTitle,
    parentRoute,
  }: { title: string; parentTitle: string; parentRoute: "/settings" } =
    $props();

  const ARROW_SIZE = 24;
  const CHEVRON_SIZE = 22;

  const backLabel = $derived(m.back_to({ page: parentTitle }));
</script>

<header
  class="-ms-md flex items-center gap-xs max-medium:-mbs-xl max-medium:min-block-4xl ios:ms-none ios:flex-col ios:items-start ios:gap-none ios:max-medium:-mbs-lg"
>
  <a
    href={resolve(parentRoute)}
    aria-label={backLabel}
    class="flex shrink-0 items-center justify-center rounded-full block-touch-target inline-touch-target ios:-ms-xs ios:gap-2xs ios:px-xs ios:font-medium ios:text-accent ios:inline-auto"
  >
    <ArrowLeft size={ARROW_SIZE} aria-hidden="true" class="ios:hidden" />
    <ChevronLeft
      size={CHEVRON_SIZE}
      aria-hidden="true"
      class="hidden ios:block"
    />
    <span class="hidden ios:inline">{parentTitle}</span>
  </a>
  <h1
    tabindex="-1"
    class="text-page-title font-bold tracking-tight max-medium:text-bar-title max-medium:font-semibold max-medium:tracking-normal ios:mbs-xs ios:max-medium:ps-xs ios:max-medium:text-page-title ios:max-medium:font-bold ios:max-medium:tracking-tight"
  >
    {title}
  </h1>
</header>
