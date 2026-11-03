<script lang="ts">
  import { onMount } from "svelte";

  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingRadios from "#lib/settings/SettingRadios.svelte";

  import {
    COLOURS_CHOICES,
    type ColoursChoice,
    getColoursSetting,
  } from "./colours.svelte";
  import { getThemeSetting } from "./theme.svelte";
  import {
    readWallpaperSwatch,
    type WallpaperSwatch,
  } from "./wallpaper-colours";

  const OMNILEAF_SWATCH =
    "conic-gradient(var(--native-color-colours-omnileaf-primary) 0 50%, var(--native-color-colours-omnileaf-container) 0 75%, var(--native-color-colours-omnileaf-surface) 0)";
  const WALLPAPER_SWATCH =
    "conic-gradient(var(--swatch-primary) 0 50%, var(--swatch-container) 0 75%, var(--swatch-surface) 0)";

  let { class: className }: { class?: string } = $props();

  const LABELS = {
    omnileaf: m.appearance_colours_omnileaf(),
    wallpaper: m.appearance_colours_wallpaper(),
  } satisfies Record<ColoursChoice, string>;

  const HINTS = {
    omnileaf: m.appearance_colours_omnileaf_hint(),
    wallpaper: m.appearance_colours_wallpaper_hint(),
  } satisfies Record<ColoursChoice, string>;

  const colours = getColoursSetting();
  const theme = getThemeSetting();
  const onPhone = new AndroidPhone();
  let swatch = $state<WallpaperSwatch | null>(null);

  const shown = $derived(swatch?.[theme.resolved]);

  onMount(async () => {
    swatch = await readWallpaperSwatch();
  });
</script>

{#if swatch !== null}
  <div class={className}>
    <SettingRadios
      title={m.appearance_colours_title()}
      options={COLOURS_CHOICES}
      labels={LABELS}
      hints={HINTS}
      chosen={colours.choice}
      onChoose={(choice: ColoursChoice) => {
        colours.choose(choice);
      }}
    >
      {#snippet leading(choice)}
        <span
          aria-hidden="true"
          data-colours-swatch={choice}
          style:--swatch-primary={shown?.primary}
          style:--swatch-container={shown?.secondaryContainer}
          style:--swatch-surface={shown?.surfaceContainerLow}
          style:background={choice === "wallpaper"
            ? WALLPAPER_SWATCH
            : OMNILEAF_SWATCH}
          class="block shrink-0 rounded-full border border-border block-colour-swatch inline-colour-swatch"
        ></span>
      {/snippet}
    </SettingRadios>
    <div
      class={[
        "flex flex-col gap-2xs pbs-sm text-muted",
        ROW_SUBTITLE_TYPE,
        onPhone.isOn && "-mx-page-start -me-page-end ps-lg pe-lg",
      ]}
    >
      <p>{m.appearance_colours_android_version()}</p>
      <p>{m.appearance_colours_covers()}</p>
    </div>
  </div>
{/if}
