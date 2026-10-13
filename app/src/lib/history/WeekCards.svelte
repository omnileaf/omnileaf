<script lang="ts">
  import { BookOpen, CircleCheck, Clock, Flame } from "@lucide/svelte";

  import { Card } from "#lib/components/ui/card/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import type { ReadingWeek } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  const ICON_SIZE = 17;

  let { week }: { week: ReadingWeek } = $props();

  const counts = new Intl.NumberFormat(getLocale());

  const cards = $derived([
    {
      label: m.history_week_read(),
      value: readingTime(week.readSeconds),
      icon: Clock,
      isOnPhones: true,
    },
    {
      label: m.history_week_books_opened(),
      value: counts.format(week.booksOpened),
      icon: BookOpen,
      isOnPhones: false,
    },
    {
      label: m.history_week_finished(),
      value: counts.format(week.booksFinished),
      icon: CircleCheck,
      isOnPhones: false,
    },
    {
      label: m.history_week_days_in_a_row(),
      value: counts.format(week.daysInARow),
      icon: Flame,
      isOnPhones: true,
    },
  ]);
</script>

<section aria-label={m.history_this_week()} class="touch:max-medium:px-xs">
  <ul class="grid grid-cols-2 gap-md medium:grid-cols-4">
    {#each cards as card (card.label)}
      <li class={["min-inline-none", !card.isOnPhones && "max-medium:hidden"]}>
        <Card class="flex items-center gap-md p-md shadow-raised">
          <span
            aria-hidden="true"
            class="flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent block-icon-tile inline-icon-tile"
          >
            <card.icon size={ICON_SIZE} />
          </span>
          <span
            class="flex flex-col-reverse wrap-anywhere min-inline-none medium:flex-col"
          >
            <span class="text-caption text-muted medium:font-semibold">
              {card.label}
            </span>
            <span
              class="text-lead font-bold tabular-nums medium:text-group-title"
            >
              {card.value}
            </span>
          </span>
        </Card>
      </li>
    {/each}
  </ul>
</section>
