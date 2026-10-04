<script lang="ts">
  import {
    browserLanguageStore,
    chooseLanguage,
    LANGUAGE_CHOICES,
    type LanguageChoice,
    languageName,
    storedLanguageChoice,
  } from "$lib/language/language";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";

  const store = browserLanguageStore();
  const chosen = storedLanguageChoice(store);

  function choose(choice: LanguageChoice): void {
    chooseLanguage(choice, {
      store,
      reload: () => {
        window.location.reload();
      },
    });
  }
</script>

<SectionHeading title={m.general_title()} />
<fieldset class="mbs-pane-gap">
  <legend class="font-medium">{m.language_label()}</legend>
  <div
    class="mbs-sm divide-y divide-border rounded-card border border-border bg-card"
  >
    {#each LANGUAGE_CHOICES as choice (choice)}
      <label
        class="flex cursor-pointer items-center gap-md px-lg min-block-touch-target"
      >
        <input
          type="radio"
          name="language"
          value={choice}
          class="accent-accent"
          checked={chosen === choice}
          onchange={() => {
            choose(choice);
          }}
        />
        {#if choice === "system"}
          {m.language_system({ language: languageName(getLocale()) })}
        {:else}
          <span lang={choice}>{languageName(choice)}</span>
        {/if}
      </label>
    {/each}
  </div>
</fieldset>
