<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { m } from "$lib/paraglide/messages.js";

  import { THEME_PREFERENCES, type ThemePreference } from "./theme";
  import { getThemeSetting } from "./theme.svelte";

  const THEME_LABELS = {
    system: m.theme_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;

  let {
    title,
    hint,
    class: className,
  }: {
    title: string;
    hint?: Snippet | undefined;
    class?: ClassValue;
  } = $props();

  const theme = getThemeSetting();
  const headingId = $props.id();
  const hintId = `${headingId}-hint`;
</script>

<section
  aria-labelledby={headingId}
  class={[
    "flex flex-col gap-sm touch:max-medium:rounded-list touch:max-medium:border touch:max-medium:border-border touch:max-medium:bg-card touch:max-medium:p-list-row",
    className,
  ]}
>
  <h2
    id={headingId}
    class="font-semibold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted"
  >
    {title}
  </h2>
  {#if hint !== undefined}
    <p
      id={hintId}
      class="text-footnote text-muted touch:medium:order-last desktop:order-last"
    >
      {@render hint()}
    </p>
  {/if}
  <div
    role="radiogroup"
    aria-labelledby={headingId}
    aria-describedby={hint === undefined ? undefined : hintId}
    class="flex gap-2xs rounded-card bg-chip p-2xs touch:medium:max-inline-segmented-touch desktop:max-inline-segmented"
  >
    {#each THEME_PREFERENCES as preference (preference)}
      <label
        class={[
          "relative flex flex-1 items-center justify-center rounded-tile text-callout block-option before:absolute before:inset-x-none before:-inset-y-xs has-focus-visible:outline-2 has-focus-visible:outline-accent",
          theme.preference === preference
            ? "bg-raised font-bold text-foreground shadow-raised"
            : "font-medium text-muted",
        ]}
      >
        <input
          type="radio"
          name={headingId}
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
