<script lang="ts">
  import { Check } from "@lucide/svelte";
  import { tick } from "svelte";

  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import {
    LANGUAGE_CHOICES,
    type LanguageChoice,
    languageName,
    LANGUAGES,
    systemLanguage,
  } from "#lib/language/language.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import { textAroundValue } from "#lib/language/placeholder.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone } from "#lib/page/platform.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  const PHONE_CHECK_SIZE = 22;
  const CHECK_SIZE = 20;
  const CHECK_STROKE = 2.4;

  let { data }: PageProps = $props();

  const language = getLanguageSetting();
  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));
  const groups: readonly (readonly LanguageChoice[])[] = $derived(
    onPhone ? [LANGUAGE_CHOICES] : [["system"], LANGUAGES],
  );

  const system = systemLanguage();
  const systemName = languageName(system);
  const systemLabel = textAroundValue((language) =>
    m.language_system({ language }),
  );

  const footnoteId = $props.id();

  function optionId(choice: LanguageChoice): string {
    return `language-${choice}`;
  }

  async function choose(choice: LanguageChoice): Promise<void> {
    const option = document.getElementById(optionId(choice));
    language.choose(choice);
    await tick();
    if (option !== null && !option.isConnected) {
      document.getElementById(optionId(choice))?.focus();
    }
  }
</script>

<SectionHeading
  title={m.language_label()}
  parent={{ route: "/(app)/settings/general", title: m.general_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <RadioGroup
    options={LANGUAGE_CHOICES}
    chosen={language.choice}
    onChoose={(choice: LanguageChoice) => {
      void choose(choice);
    }}
    aria-label={m.language_label()}
    aria-describedby={onPhone ? footnoteId : undefined}
    class="flex flex-col gap-lg"
  >
    {#each groups as group, index (index)}
      <div
        class="divide-y divide-border rounded-list border border-border bg-card"
      >
        {#each group as choice (choice)}
          {@const isChosen = language.choice === choice}
          <RadioGroupItem
            id={optionId(choice)}
            value={choice}
            class={[
              "flex items-center gap-md py-xs ps-lg pe-list-row text-start transition-control inline-full min-block-phone-row first:rounded-ss-list first:rounded-se-list last:rounded-ee-list last:rounded-es-list hover:bg-hover focus-visible:-outline-offset-2 active:bg-pressed",
              "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
              "desktop:py-none desktop:ps-list-row desktop:text-callout desktop:min-block-settings-row",
              isChosen ? "font-semibold" : "font-medium",
            ]}
          >
            {#if choice === "system"}
              <span class="flex-1">
                {#if systemLabel === undefined}
                  {m.language_system({ language: systemName })}
                {:else}
                  {systemLabel.before}<span lang={system}>{systemName}</span
                  >{systemLabel.after}
                {/if}
              </span>
            {:else}
              <span lang={choice} class="flex-1">{languageName(choice)}</span>
            {/if}
            {#if isChosen}
              <Check
                size={onPhone ? PHONE_CHECK_SIZE : CHECK_SIZE}
                strokeWidth={CHECK_STROKE}
                class="shrink-0 text-accent"
              />
            {/if}
          </RadioGroupItem>
        {/each}
      </div>
    {/each}
  </RadioGroup>
  {#if onPhone}
    <p id={footnoteId} class="px-xs text-footnote text-muted">
      {m.language_more_coming()}
    </p>
  {/if}
</div>
