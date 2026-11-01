<script lang="ts">
  import type { OnCovers } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { ANDROID_FILTER_HEADING } from "./filter-sheet-look";
  import { type GroupLook, PLAIN_GROUP_LOOK } from "./group-look";
  import ViewSwitchRow from "./ViewSwitchRow.svelte";

  interface Choice {
    readonly name: keyof OnCovers;
    readonly label: () => string;
  }

  const CHOICES: readonly Choice[] = [
    { name: "showsUnreadCount", label: m.library_on_covers_unread_count },
    { name: "showsLanguage", label: m.library_on_covers_language },
    {
      name: "showsReadingProgress",
      label: m.library_on_covers_reading_progress,
    },
    { name: "showsDownloaded", label: m.library_on_covers_downloaded },
    {
      name: "showsContinueButton",
      label: m.library_on_covers_continue_button,
    },
  ];

  let {
    onCovers,
    onChoose,
    look = PLAIN_GROUP_LOOK,
    isMaterial = false,
  }: {
    onCovers: OnCovers;
    onChoose: (name: keyof OnCovers, isShown: boolean) => void;
    look?: GroupLook;
    isMaterial?: boolean;
  } = $props();

  const headingId = $props.id();
</script>

<section
  role="group"
  aria-labelledby={headingId}
  class={["flex flex-col", look.section]}
>
  <h3
    id={headingId}
    class={isMaterial
      ? ANDROID_FILTER_HEADING
      : [look.heading, look.followingHeading]}
  >
    {m.library_on_covers()}
  </h3>
  <div class={isMaterial ? "flex flex-col" : look.group}>
    {#each CHOICES as choice (choice.name)}
      <ViewSwitchRow
        {isMaterial}
        titleClass={look.rowTitle}
        label={choice.label()}
        isOn={onCovers[choice.name]}
        onToggle={(isShown: boolean) => {
          onChoose(choice.name, isShown);
        }}
      />
    {/each}
  </div>
</section>
