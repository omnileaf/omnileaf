<script lang="ts">
  import { Check } from "@lucide/svelte";

  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
  import {
    getOpensOnSetting,
    OPENING_PLACES,
    type OpeningPlace,
  } from "#lib/general/opens-on.svelte.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import GroupedGround from "#lib/settings/GroupedGround.svelte";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";
  import { m } from "#lib/paraglide/messages.js";

  const CHECK_SIZE = 22;
  const CHECK_STROKE = 2.4;

  const opensOn = getOpensOnSetting();
  const PLACE_LABELS = {
    library: m.general_opens_library(),
    history: m.general_opens_history(),
    lastBook: m.general_opens_last_book(),
  } satisfies Record<OpeningPlace, string>;
</script>

<GroupedGround>
  <SectionHeading
    title={m.general_opens_on()}
    parent={{ route: "/(app)/settings/general", title: m.general_title() }}
  />
  <div class="mbs-pane-gap flex flex-col gap-sm">
    <RadioGroup
      options={OPENING_PLACES}
      chosen={opensOn.choice}
      onChoose={(choice: OpeningPlace) => {
        opensOn.choose(choice);
      }}
      aria-label={m.general_opens_on()}
      class={[
        "flex flex-col divide-y divide-border rounded-list border border-border bg-card",
        GROUP_PLATE,
      ]}
    >
      {#each OPENING_PLACES as choice (choice)}
        {@const isChosen = opensOn.choice === choice}
        <RadioGroupItem
          value={choice}
          class={[
            "flex items-center gap-md py-xs ps-lg pe-list-row text-start transition-control inline-full min-block-phone-row hover:bg-hover focus-visible:-outline-offset-2 active:bg-pressed",
            isChosen ? "font-semibold" : "font-medium",
          ]}
        >
          <span class="flex flex-1 flex-col gap-2xs">
            <span>{PLACE_LABELS[choice]}</span>
            {#if choice === "lastBook"}
              <span class="text-detail font-regular text-muted">
                {m.general_opens_last_book_hint()}
              </span>
            {/if}
          </span>
          {#if isChosen}
            <Check
              size={CHECK_SIZE}
              strokeWidth={CHECK_STROKE}
              class="shrink-0 text-accent"
            />
          {/if}
        </RadioGroupItem>
      {/each}
    </RadioGroup>
  </div>
</GroupedGround>
