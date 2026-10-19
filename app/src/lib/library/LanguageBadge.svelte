<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let { language, class: className }: { language: string; class?: ClassValue } =
    $props();

  const languageNames = $derived(
    new Intl.DisplayNames([getLocale()], { type: "language" }),
  );
</script>

<span
  role="img"
  aria-label={languageNames.of(language) ?? language}
  class={cn(
    "rounded-badge bg-card px-badge-inline py-badge-block text-badge font-semibold text-foreground uppercase",
    className,
  )}
>
  {language}
</span>
