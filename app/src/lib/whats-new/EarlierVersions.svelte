<script lang="ts">
  import { Sparkles } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { CurrentAboutLook } from "#lib/about/about-look.svelte.ts";
  import AboutLinkRow from "#lib/about/AboutLinkRow.svelte";
  import { ROW_LISTS } from "#lib/about/look.ts";
  import type { VersionNotes } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { FLUSH_LIST_HEADING } from "#lib/settings/android-flush-look.ts";

  import { earlierVersions } from "./earlier-version-line.ts";

  let { earlier }: { earlier: readonly VersionNotes[] } = $props();

  const headingId = $props.id();
  const aboutLook = new CurrentAboutLook();
  const versions = $derived(earlierVersions(earlier));
</script>

<section data-settings-group aria-labelledby={headingId}>
  <h2 id={headingId} class={FLUSH_LIST_HEADING}>{m.whats_new_earlier()}</h2>
  <ul class={ROW_LISTS[aboutLook.current]}>
    {#each versions as { notes, line } (notes.version)}
      <AboutLinkRow
        href={resolve("/(app)/settings/about/whats-new/[version]", {
          version: notes.version,
        })}
        icon={Sparkles}
        iconName="sparkles"
        label={notes.version}
        hint={line}
        look={aboutLook.current}
      />
    {/each}
  </ul>
</section>
