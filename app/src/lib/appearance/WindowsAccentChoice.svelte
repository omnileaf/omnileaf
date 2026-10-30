<script lang="ts">
  import { CircleAlert, Palette } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    COLOURS_CHOICES,
    type ColoursChoice,
    getColoursSetting,
  } from "./colours.svelte";

  const ICON_SIZE = 20;

  const CHOICE_LABELS = {
    omnileaf: m.appearance_accent_omnileaf,
    wallpaper: m.appearance_accent_windows,
  } satisfies Record<ColoursChoice, () => string>;

  let { class: className }: { class?: ClassValue } = $props();

  const colours = getColoursSetting();
  const notices = getNotices();
  const titleId = $props.id();
  const hintId = `${titleId}-hint`;

  const followsWindows = $derived(colours.choice === "wallpaper");

  function isColoursChoice(value: string): value is ColoursChoice {
    return COLOURS_CHOICES.some((choice) => choice === value);
  }

  async function openColourSettings(): Promise<void> {
    const opened = await commands.openColourSettings();
    if (opened.status === "error") {
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.appearance_windows_colour_settings_failed(),
      });
    }
  }
</script>

<section
  aria-labelledby={titleId}
  class={[
    "flex flex-wrap items-center gap-md rounded-list border border-border bg-card py-sm ps-list-row pe-md min-block-settings-row",
    GROUP_PLATE,
    className,
  ]}
>
  <Palette size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <div class="flex grow basis-permission-reason flex-col items-start gap-2xs">
    <h2 id={titleId} class="text-callout font-semibold">
      {m.appearance_accent_colour()}
    </h2>
    <p id={hintId} class="text-detail text-muted">
      {followsWindows
        ? m.appearance_accent_hint_windows()
        : m.appearance_accent_hint()}
    </p>
    {#if followsWindows}
      <Button
        variant="link"
        size="small"
        class="text-detail"
        onclick={openColourSettings}
      >
        {m.appearance_windows_colour_settings()}
      </Button>
    {/if}
  </div>
  <NativeSelect
    aria-labelledby={titleId}
    aria-describedby={hintId}
    value={colours.choice}
    class="shrink-0 inline-setting-control"
    onchange={({
      currentTarget,
    }: Event & { currentTarget: HTMLSelectElement }) => {
      if (isColoursChoice(currentTarget.value)) {
        colours.choose(currentTarget.value);
      }
    }}
  >
    {#each COLOURS_CHOICES as choice (choice)}
      <option value={choice}>{CHOICE_LABELS[choice]()}</option>
    {/each}
  </NativeSelect>
</section>
