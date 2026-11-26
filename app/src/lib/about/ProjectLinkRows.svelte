<script lang="ts">
  import { Code } from "@lucide/svelte";

  import type { IconName } from "#lib/icons/names.ts";
  import type { ProjectLink } from "#lib/ipc/bindings.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import AboutButtonRow from "./AboutButtonRow.svelte";
  import type { LinkOpening } from "./link-opening.svelte";
  import type { AboutLook, HintKind } from "./look";

  interface ExternalRow {
    readonly link: ProjectLink;
    readonly icon: Glyph;
    readonly iconName: IconName;
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
      icon: Code,
      iconName: "code",
      label: m.about_source_code(),
      hint: sourceCode,
      hintKind: "address",
    },
  ]);
</script>

{#each externalRows as external (external.link)}
  <li>
    <AboutButtonRow
      icon={external.icon}
      iconName={external.iconName}
      label={external.label}
      hint={external.hint}
      hintKind={external.hintKind}
      {look}
      opensBrowser
      onPress={() => {
        void opening.open(external.link);
      }}
    />
  </li>
{/each}
