<script lang="ts">
  import {
    THEME_PREFERENCES,
    type ThemePreference,
  } from "$lib/appearance/theme";
  import { getThemeSetting } from "$lib/appearance/theme.svelte";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";

  const THEME_LABELS = {
    system: m.theme_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;

  const theme = getThemeSetting();
</script>

<SectionHeading title={m.appearance_title()} />
<div class="mbs-xl rounded-card border border-border bg-card p-md">
  <fieldset>
    <legend class="font-medium">{m.appearance_light_or_dark()}</legend>
    <div class="mbs-sm flex gap-xs rounded-tile bg-chip p-xs">
      {#each THEME_PREFERENCES as preference (preference)}
        <label
          class={[
            "flex flex-1 cursor-pointer items-center justify-center rounded-control text-footnote min-block-touch-target has-focus-visible:outline-2 has-focus-visible:outline-accent",
            theme.preference === preference
              ? "bg-raised font-bold shadow-raised"
              : "font-medium",
          ]}
        >
          <input
            type="radio"
            name="theme"
            value={preference}
            class="sr-only"
            checked={theme.preference === preference}
            onchange={() => {
              theme.choose(preference);
            }}
          />
          {THEME_LABELS[preference]()}
        </label>
      {/each}
    </div>
  </fieldset>
</div>
