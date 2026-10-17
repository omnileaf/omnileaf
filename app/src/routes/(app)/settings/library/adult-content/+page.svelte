<script lang="ts">
  import { onMount } from "svelte";

  import {
    type AdultContent,
    type AdultTreatment,
    commands,
  } from "#lib/ipc/bindings.ts";
  import AdultContentChoice from "#lib/library/AdultContentChoice.svelte";
  import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const content = new StoredChoice<AdultContent>(
    {
      read: () => commands.libraryAdultContent(),
      store: (chosen: AdultContent) => commands.setLibraryAdultContent(chosen),
      fallback: NEW_ADULT_CONTENT,
    },
    (error) => {
      reportError(error);
    },
  );
  const onPointer = $derived(isPointer(data.appInfo.platform));

  onMount(() => {
    void content.load();
  });
</script>

<SectionHeading
  title={m.adult_content_title()}
  parent={{ route: "/(app)/settings/library", title: m.library_title() }}
/>
{#if content.reading.kind === "read"}
  {@const chosen = content.reading.value}
  <div class="mbs-pane-gap flex flex-col gap-pane-gap">
    <div class="flex flex-col gap-sm">
      <p class="text-footnote text-muted">{m.adult_content_intro()}</p>
      <AdultContentChoice
        chosen={chosen.treatment}
        {onPointer}
        onChoose={(treatment: AdultTreatment) => {
          content.choose({ ...chosen, treatment });
        }}
      />
    </div>
    <SettingSwitch
      label={m.adult_content_age_ratings()}
      description={m.adult_content_age_ratings_help()}
      isOn={chosen.countsAgeRatings}
      onToggle={() => {
        content.choose({
          ...chosen,
          countsAgeRatings: !chosen.countsAgeRatings,
        });
      }}
      class="rounded-card border border-border bg-card"
    />
  </div>
{/if}
