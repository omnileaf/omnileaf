<script lang="ts">
  import { ExternalLink } from "@lucide/svelte";

  import type { ProjectLink } from "#lib/ipc/bindings.ts";
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
      link: "sourceCode",
      label: m.about_source_code(),
      hint: sourceCode,
      hintKind: "address",
    },
    {
      link: "newIssue",
      label: m.about_report_problem(),
      hint: m.about_report_problem_hint(),
      hintKind: "prose",
    },
  ]);
</script>

{#each externalRows as external (external.link)}
  <li>
    <button
      type="button"
      class={ROW_LOOKS[look]}
      onclick={() => {
        void opening.open(external.link);
      }}
    >
      <RowText
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
    </button>
  </li>
{/each}
