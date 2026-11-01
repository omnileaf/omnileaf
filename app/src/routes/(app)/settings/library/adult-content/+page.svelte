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
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
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
  const android = new AndroidPhone();
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
    <div class="mbs-pane-gap flex flex-col gap-pane-gap macos:gap-lg">
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
      <div>
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
          class={android.isOn
            ? ""
            : "rounded-card border border-border bg-card"}
        />
      </div>
      {#if android.isOn}
        <p class="text-native-row-subtitle/native-row-subtitle text-muted">
          {m.adult_content_footer()}
        </p>
      {/if}
    </div>
  {/if}
</GroupedGround>
