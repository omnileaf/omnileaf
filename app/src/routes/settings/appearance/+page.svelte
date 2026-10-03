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

  const headingId = $props.id();
</script>

<SectionHeading title={m.appearance_title()} />
<section
  aria-labelledby={headingId}
  class="mbs-pane-gap flex flex-col gap-sm touch:max-medium:rounded-list touch:max-medium:border touch:max-medium:border-border touch:max-medium:bg-card touch:max-medium:p-list-row"
>
  <h2
    id={headingId}
    class="font-semibold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted"
  >
    {m.appearance_light_or_dark()}
  </h2>
  <p
    class="text-footnote text-muted touch:medium:order-last desktop:order-last"
  >
    {m.appearance_system_hint()}
  </p>
  <div
    role="radiogroup"
    aria-labelledby={headingId}
    class="flex gap-2xs rounded-card bg-chip p-2xs touch:medium:max-inline-segmented-touch desktop:max-inline-segmented"
  >
    {#each THEME_PREFERENCES as preference (preference)}
      <label
        class={[
          "relative flex flex-1 cursor-pointer items-center justify-center rounded-tile text-callout block-option before:absolute before:inset-x-none before:-inset-y-xs has-focus-visible:outline-2 has-focus-visible:outline-accent",
          theme.preference === preference
            ? "bg-raised font-bold text-foreground shadow-raised"
            : "font-medium text-muted",
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
</section>
