<script lang="ts" module>
  const SCHEDULES = ["everyDay", "off"] as const;

  type Schedule = (typeof SCHEDULES)[number];

  const SCHEDULE_NAMES = {
    everyDay: m.library_rescan_schedule_every_day,
    off: m.library_rescan_schedule_off,
  } satisfies Record<Schedule, () => string>;
</script>

<script lang="ts">
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import ChoiceDialog from "#lib/settings/ChoiceDialog.svelte";

  import type { ScheduledRescansSetting } from "./scheduled-rescans.svelte.ts";

  let {
    schedule,
    platform,
  }: { schedule: ScheduledRescansSetting; platform: Platform } = $props();

  let isOpen = $state(false);

  const chosen: Schedule = $derived(
    schedule.isOnFor(platform) ? "everyDay" : "off",
  );
</script>

<Item look="row">
  {#snippet child({ props })}
    <button
      {...props}
      type="button"
      aria-haspopup="dialog"
      onclick={() => {
        isOpen = true;
      }}
    >
      <Icon name="refresh-cw" class="shrink-0" />
      <ItemContent>
        <ItemTitle>{m.library_rescan_schedule_title()}</ItemTitle>
        <ItemDescription>{SCHEDULE_NAMES[chosen]()}</ItemDescription>
      </ItemContent>
    </button>
  {/snippet}
</Item>
<ChoiceDialog
  {isOpen}
  title={m.library_rescan_schedule_title()}
  choices={SCHEDULES.map((value) => ({
    value,
    label: SCHEDULE_NAMES[value](),
  }))}
  {chosen}
  onChoose={(value: Schedule) => {
    schedule.turn(value === "everyDay");
  }}
  onClose={() => {
    isOpen = false;
  }}
/>
