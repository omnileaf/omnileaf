<script lang="ts">
  import { Check } from "@lucide/svelte";

  import {
    browserLanguageStore,
    chooseLanguage,
    LANGUAGE_CHOICES,
    type LanguageChoice,
    languageName,
    LANGUAGES,
    storedLanguageChoice,
    systemLanguage,
  } from "$lib/language/language";
  import { textAroundValue } from "$lib/language/placeholder";
  import { WindowWidth } from "$lib/page/breakpoints";
  import { isPhone } from "$lib/page/platform";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  const PHONE_CHECK_SIZE = 22;
  const CHECK_SIZE = 20;
  const CHECK_STROKE = 2.4;

  let { data }: PageProps = $props();

  const store = browserLanguageStore();
  const chosen = storedLanguageChoice(store);
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

  function choose(choice: LanguageChoice): void {
    chooseLanguage(choice, {
      store,
      reload: () => {
        window.location.reload();
      },
    });
  }
</script>

<SectionHeading
  title={m.language_label()}
  parent={{ route: "/settings/general", title: m.general_title() }}
/>
<div class="mbs-pane-gap flex flex-col gap-sm">
  <div
    role="radiogroup"
    aria-label={m.language_label()}
    aria-describedby={onPhone ? footnoteId : undefined}
    class="flex flex-col gap-lg"
  >
    {#each groups as group, index (index)}
      <div
        class="divide-y divide-border rounded-list border border-border bg-card"
      >
        {#each group as choice (choice)}
          {@const isChosen = chosen === choice}
          <label
            class={[
              "flex cursor-pointer items-center gap-md py-xs ps-lg pe-list-row min-block-phone-row has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent",
              "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
              "desktop:py-none desktop:ps-list-row desktop:text-callout desktop:min-block-settings-row",
              isChosen ? "font-semibold" : "font-medium",
            ]}
          >
            <input
              type="radio"
              name="language"
              value={choice}
              class="sr-only"
              checked={isChosen}
              onchange={() => {
                choose(choice);
              }}
            />
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
          </label>
        {/each}
      </div>
    {/each}
  </div>
  {#if onPhone}
    <p id={footnoteId} class="px-xs text-footnote text-muted">
      {m.language_more_coming()}
    </p>
  {/if}
</div>
