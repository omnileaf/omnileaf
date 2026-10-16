<script lang="ts">
  import { Bug, Code, ExternalLink } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Item } from "#lib/components/ui/item/index.ts";
  import type { ProjectLink } from "#lib/ipc/bindings.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { LinkOpening } from "./link-opening.svelte";
  import {
    type AboutLook,
    type HintKind,
    ROW_ICON_SIZES,
    ROW_LOOKS,
  } from "./look";
  import RowText from "./RowText.svelte";

  interface ExternalRow {
    readonly link: ProjectLink;
    readonly icon: Glyph;
    readonly label: string;
    readonly hint: string;
    readonly hintKind: HintKind;
  }

  let {
    opening,
    sourceCode,
    look,
  }: { opening: LinkOpening; sourceCode: string; look: AboutLook } = $props();

  const externalRows: readonly ExternalRow[] = $derived([
    {
      link: "newIssue",
      icon: Bug,
      label: m.about_report_problem(),
      hint: m.about_report_problem_hint(),
      hintKind: "prose",
    },
    {
      link: "sourceCode",
      icon: Code,
      label: m.about_source_code(),
      hint: sourceCode,
      hintKind: "address",
    },
  ]);
</script>

{#each externalRows as external (external.link)}
  <li>
    <Item look={ROW_LOOKS[look]}>
      {#snippet child({ props })}
        <Button
          {...props}
          type="button"
          look="row"
          onclick={() => {
            void opening.open(external.link);
          }}
        >
          <RowText
            icon={external.icon}
            label={external.label}
            hint={external.hint}
            hintKind={external.hintKind}
            {look}
          />
          <ExternalLink
            role="img"
            aria-label={m.about_opens_in_browser()}
            size={ROW_ICON_SIZES[look]}
            class="shrink-0 text-muted"
          />
        </Button>
      {/snippet}
    </Item>
  </li>
{/each}
