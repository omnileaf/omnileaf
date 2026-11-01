<script lang="ts" generics="Option extends string">
  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";

  import { currentPlatform } from "#lib/page/platform.ts";

  import { MACOS_RADIOS_LOOK, radiosLook } from "./radios-look";

  let {
    title,
    options,
    labels,
    hints = {},
    chosen,
    onChoose,
  }: {
    title: string;
    options: readonly Option[];
    labels: Record<Option, string>;
    hints?: Partial<Record<Option, string>>;
    chosen: Option;
    onChoose: (option: Option) => void;
  } = $props();

  const id = $props.id();
  const android = new AndroidPhone();
  const platform = currentPlatform();
  const look = $derived(
    platform === "macos" ? MACOS_RADIOS_LOOK : radiosLook(android.isOn),
  );
</script>

<section aria-labelledby="{id}-title" class={look.section}>
  <h2 id="{id}-title" class={look.heading}>{title}</h2>
  <RadioGroup
    {options}
    {chosen}
    {onChoose}
    aria-labelledby="{id}-title"
    class={look.group}
  >
    {#each options as option (option)}
      {@const isChosen = chosen === option}
      {@const hint = hints[option]}
      <RadioGroupItem
        value={option}
        aria-labelledby="{id}-{option}-label"
        aria-describedby={hint === undefined ? undefined : `${id}-${option}`}
        class={look.row}
      >
        <span
          aria-hidden="true"
          data-radio-mark
          class={[look.mark, isChosen ? look.markOn : look.markOff]}
        >
          {#if isChosen}
            <span class={look.dot}></span>
          {/if}
        </span>
        <span class={look.words}>
          <span id="{id}-{option}-label" class={look.label}>
            {labels[option]}
          </span>
          {#if hint !== undefined}
            <span id="{id}-{option}" class={look.hint}>
              {hint}
            </span>
          {/if}
        </span>
      </RadioGroupItem>
    {/each}
  </RadioGroup>
</section>
