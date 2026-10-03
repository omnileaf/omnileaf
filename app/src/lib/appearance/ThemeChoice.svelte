<script lang="ts">
  import type { Snippet } from "svelte";

  import { m } from "$lib/paraglide/messages.js";

  import { THEME_PREFERENCES, type ThemePreference } from "./theme";
  import { getThemeSetting } from "./theme.svelte";

  const THEME_LABELS = {
    system: m.theme_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;

  let { legend, help }: { legend: string; help?: Snippet | undefined } =
    $props();

  const theme = getThemeSetting();
  const group = $props.id();
  const helpId = `${group}-help`;
</script>

<fieldset aria-describedby={help === undefined ? undefined : helpId}>
  <legend class="font-medium">{legend}</legend>
  {#if help !== undefined}
    <p id={helpId} class="text-caption text-muted">{@render help()}</p>
  {/if}
  <div class="mbs-sm flex gap-xs rounded-control bg-chip p-xs">
    {#each THEME_PREFERENCES as preference (preference)}
      <label
        class={[
          "flex flex-1 cursor-pointer items-center justify-center rounded-control min-block-touch-target has-focus-visible:outline-2 has-focus-visible:outline-accent",
          theme.preference === preference
            ? "bg-card font-bold"
            : "font-medium text-muted",
        ]}
      >
        <input
          type="radio"
          name={group}
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
