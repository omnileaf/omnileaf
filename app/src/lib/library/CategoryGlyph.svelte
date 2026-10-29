<script lang="ts">
  import { Check, ChevronDown, Pencil, Plus } from "@lucide/svelte";

  import { Icon } from "#lib/components/ui/icon/index.ts";

  const ICON_SIZE = 16;
  const ARROW_ICON_SIZE = 18;

  const LUCIDE_GLYPHS = {
    check: { icon: Check, size: ICON_SIZE },
    pencil: { icon: Pencil, size: ICON_SIZE },
    plus: { icon: Plus, size: ICON_SIZE },
    "chevron-down": { icon: ChevronDown, size: ARROW_ICON_SIZE },
  } as const;

  let {
    name,
    isMaterial,
  }: { name: keyof typeof LUCIDE_GLYPHS; isMaterial: boolean } = $props();

  const lucide = $derived(LUCIDE_GLYPHS[name]);
</script>

{#if isMaterial}
  <Icon {name} />
{:else}
  <lucide.icon size={lucide.size} aria-hidden="true" />
{/if}
