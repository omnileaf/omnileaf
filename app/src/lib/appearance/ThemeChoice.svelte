<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { m } from "$lib/paraglide/messages.js";
  import SegmentedChoice from "$lib/settings/SegmentedChoice.svelte";

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
  <SegmentedChoice
    name={headingId}
    options={THEME_PREFERENCES}
    labels={THEME_LABELS}
    chosen={theme.preference}
    labelledBy={headingId}
    describedBy={hint === undefined ? undefined : hintId}
    onChoose={(preference: ThemePreference) => {
      theme.choose(preference);
    }}
  />
</section>
