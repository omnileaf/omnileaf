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
  import { androidListLook } from "#lib/settings/android-list-look.svelte.ts";
  import { currentPlatform, isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import { LIST_PLATE } from "#lib/settings/grouped-rows-look.ts";
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
  const android = androidListLook();
  const isMacos = currentPlatform() === "macos";
  const CARD = "rounded-card border border-border bg-card";
  const plate = $derived(android.isOn ? "" : isMacos ? LIST_PLATE : CARD);
  const onPointer = $derived(isPointer(data.appInfo.platform));

  onMount(() => {
    void content.load();
  });
</script>

<GroupedGround>
  <SectionHeading
    title={m.adult_content_title()}
    parent={{ route: "/(app)/settings/library", title: m.library_title() }}
  />
  {#if content.reading.kind === "read"}
    {@const chosen = content.reading.value}
    <div
      class="mbs-pane-gap flex flex-col gap-pane-gap android:mbs-none android:gap-none macos:gap-lg"
    >
      <div class="flex flex-col gap-sm macos:gap-lg">
        <p
          class="text-footnote text-muted macos:text-native-button/native-button"
        >
          {m.adult_content_intro()}
        </p>
        <AdultContentChoice
          chosen={chosen.treatment}
          {onPointer}
          onChoose={(treatment: AdultTreatment) => {
            content.choose({ ...chosen, treatment });
          }}
        />
      </div>
      <div data-settings-group>
        <SettingSwitch
          bleeds
          label={m.adult_content_age_ratings()}
          description={m.adult_content_age_ratings_help()}
          isOn={chosen.countsAgeRatings}
          onToggle={() => {
            content.choose({
              ...chosen,
              countsAgeRatings: !chosen.countsAgeRatings,
            });
          }}
          grouped={isMacos}
          class={plate}
        />
      </div>
    </div>
  {/if}
</GroupedGround>
