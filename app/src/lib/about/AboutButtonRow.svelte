<script lang="ts">
  import { ExternalLink } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Item } from "#lib/components/ui/item/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type AboutLook,
    type HintKind,
    ROW_ICON_SIZES,
    ROW_LOOKS,
  } from "./look";
  import RowText from "./RowText.svelte";

  let {
    icon,
    iconName,
    label,
    hint,
    hintKind,
    look,
    opensBrowser = false,
    isBusy,
    onPress,
  }: {
    icon: Glyph;
    iconName: IconName;
    label: string;
    hint?: string | undefined;
    hintKind?: HintKind | undefined;
    look: AboutLook;
    opensBrowser?: boolean;
    isBusy?: boolean | undefined;
    onPress: () => void;
  } = $props();
</script>

<Item look={ROW_LOOKS[look]}>
  {#snippet child({ props })}
    <Button
      {...props}
      type="button"
      look="row"
      aria-busy={isBusy}
      onclick={onPress}
    >
      <RowText {icon} {iconName} {label} {hint} {hintKind} {look} />
      {#if opensBrowser}
        <ExternalLink
          role="img"
          aria-label={m.about_opens_in_browser()}
          size={ROW_ICON_SIZES[look]}
          class="shrink-0 text-muted"
        />
      {/if}
    </Button>
  {/snippet}
</Item>
