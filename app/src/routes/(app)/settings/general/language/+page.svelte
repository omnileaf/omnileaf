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
    systemLanguage,
  } from "#lib/language/language.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
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

  const system = systemLanguage();
  const systemName = languageName(system);
  const id = $props.id();
  const footnoteId = `${id}-footnote`;
  const systemTitleId = `${id}-system`;
  const systemNameId = `${id}-system-name`;

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
  <p class="text-detail text-muted">{m.language_intro()}</p>
  <RadioGroup
    options={LANGUAGE_CHOICES}
    chosen={language.choice}
    onChoose={(choice: LanguageChoice) => {
      void choose(choice);
    }}
    aria-label={m.language_label()}
    aria-describedby={onPhone ? footnoteId : undefined}
    class={[
      "flex flex-col divide-y divide-border rounded-list border border-border bg-card",
      GROUP_PLATE,
    ]}
  >
    {#each LANGUAGE_CHOICES as choice (choice)}
      {@const isChosen = language.choice === choice}
      <RadioGroupItem
        id={optionId(choice)}
        value={choice}
        aria-labelledby={choice === "system" ? systemTitleId : undefined}
        aria-describedby={choice === "system" ? systemNameId : undefined}
        class={[
          "flex items-center gap-md py-xs ps-lg pe-list-row text-start transition-control inline-full min-block-phone-row first:rounded-ss-list first:rounded-se-list last:rounded-ee-list last:rounded-es-list hover:bg-hover focus-visible:-outline-offset-2 active:bg-pressed",
          "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
          "desktop:py-none desktop:ps-list-row desktop:text-callout desktop:min-block-settings-row",
          isChosen ? "font-semibold" : "font-medium",
        ]}
      >
        {#if choice === "system"}
          <span class="flex flex-1 flex-col gap-2xs">
            <span id={systemTitleId}>{m.language_use_system()}</span>
            <span
              id={systemNameId}
              lang={system}
              class="text-detail font-regular text-muted">{systemName}</span
            >
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
  </RadioGroup>
  {#if onPhone}
    <p id={footnoteId} class="px-xs text-footnote text-muted">
      {m.language_more_coming()}
    </p>
  {/if}
</div>
