<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Item } from "#lib/components/ui/item/index.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import type { SettingsPage } from "#lib/settings/sections.ts";

  import { type AboutLook, ROW_ICON_SIZES, ROW_LOOKS } from "./look";
  import RowText from "./RowText.svelte";

  let {
    route,
    icon,
    label,
    hint,
    look,
  }: {
    route: SettingsPage;
    icon: Glyph;
    label: string;
    hint: string;
    look: AboutLook;
  } = $props();
</script>

<li>
  <Item look={ROW_LOOKS[look]}>
    {#snippet child({ props })}
      <a href={resolve(route)} {...props}>
        <RowText {icon} {label} {hint} {look} />
        <ChevronRight
          size={ROW_ICON_SIZES[look]}
          class="shrink-0 text-muted rtl:-scale-x-100"
        />
      </a>
    {/snippet}
  </Item>
</li>
