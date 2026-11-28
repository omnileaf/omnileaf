<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import type { ResolvedPathname } from "$app/types";
  import { Item } from "#lib/components/ui/item/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import { type AboutLook, ROW_ICON_SIZES, ROW_LOOKS } from "./look";
  import RowText from "./RowText.svelte";

  let {
    href,
    icon,
    iconName,
    label,
    hint,
    look,
  }: {
    href: ResolvedPathname;
    icon: Glyph;
    iconName: IconName;
    label: string;
    hint?: string | undefined;
    look: AboutLook;
  } = $props();
</script>

<li>
  <Item look={ROW_LOOKS[look]}>
    {#snippet child({ props })}
      <a {href} {...props}>
        <RowText {icon} {iconName} {label} {hint} {look} />
        <ChevronRight
          size={ROW_ICON_SIZES[look]}
          class="shrink-0 text-muted rtl:-scale-x-100 android:max-medium:hidden"
        />
      </a>
    {/snippet}
  </Item>
</li>
