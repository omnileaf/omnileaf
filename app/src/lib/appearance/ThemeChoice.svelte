<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { CHOICE_ROW } from "#lib/first-launch/choice-row.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SegmentedControl from "#lib/page/SegmentedControl.svelte";

  import { THEME_PREFERENCES, type ThemePreference } from "./theme";
  import { getThemeSetting } from "./theme.svelte";

  const THEME_LABELS = {
    system: m.theme_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;

  const ICON_SIZE = 20;

  type Placement = "settings" | "first-launch" | "setup-row";

  const LOOKS = {
    settings: {
      section:
        "touch:max-medium:rounded-list touch:max-medium:border touch:max-medium:border-border touch:max-medium:bg-card touch:max-medium:p-list-row",
      title:
        "font-semibold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted",
      hint: "text-footnote text-muted touch:medium:order-last desktop:order-last",
      control: "",
    },
    "first-launch": {
      section: "",
      title:
        "font-semibold touch:medium:text-label touch:medium:text-muted desktop:text-footnote desktop:text-muted touch:max-medium:text-label touch:max-medium:font-bold",
      hint: "order-last text-footnote text-muted",
      control: "",
    },
    "setup-row": {
      section: CHOICE_ROW.section,
      title: CHOICE_ROW.title,
      hint: CHOICE_ROW.hint,
      control: CHOICE_ROW.control,
    },
  } satisfies Record<
    Placement,
    Record<"section" | "title" | "hint" | "control", string>
  >;

  let {
    title,
    hint,
    placement = "settings",
    icon: Icon,
    class: className,
  }: {
    title: string;
    icon?: Glyph;
    hint?: Snippet | undefined;
    placement?: Placement;
    class?: ClassValue;
  } = $props();

  const look = $derived(LOOKS[placement]);

  const theme = getThemeSetting();
  const headingId = $props.id();
  const hintId = `${headingId}-hint`;
</script>

<section
  aria-labelledby={headingId}
  class={[
    placement !== "setup-row" && "flex flex-col gap-sm",
    look.section,
    className,
  ]}
>
  {#if placement === "setup-row" && Icon !== undefined}
    <span aria-hidden="true" class={CHOICE_ROW.icon}>
      <Icon size={ICON_SIZE} />
    </span>
  {/if}
  <h2 id={headingId} class={look.title}>
    {title}
  </h2>
  {#if hint !== undefined}
    <p id={hintId} class={look.hint}>
      {@render hint()}
    </p>
  {/if}
  <SegmentedControl
    options={THEME_PREFERENCES}
    labels={THEME_LABELS}
    chosen={theme.preference}
    labelledBy={headingId}
    describedBy={hint === undefined ? undefined : hintId}
    isSetupRow={placement === "setup-row"}
    class={look.control}
    onChoose={(preference: ThemePreference) => {
      theme.choose(preference);
    }}
  />
</section>
