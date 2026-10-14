import {
  type HistoryCalendar,
  lastWeekDays,
} from "#lib/history/history-days.ts";
import type { LocalDay } from "#lib/history/local-date.ts";
import type { commands } from "#lib/ipc/bindings.ts";

type Read = ReturnType<typeof commands.readingTimeSince>;

/** Where the core counts the time read over a run of days. */
export interface WeekReads {
  since(first: LocalDay): Read;
  between(first: LocalDay, last: LocalDay): Read;
}

/** How long was read this week and last week, as the latest read of them answers. */
export class WeekTotals {
  thisWeekSeconds: number | undefined = $state();
  lastWeekSeconds: number | undefined = $state();
  #latestRead = 0;

  constructor(
    private readonly reads: WeekReads,
    private readonly onFailure: (error: unknown) => void,
  ) {}

  async read(calendar: HistoryCalendar): Promise<void> {
    const read = ++this.#latestRead;
    const { first, last } = lastWeekDays(calendar);
    await Promise.all([
      this.#keep(read, this.reads.since(calendar.weekStart), (seconds) => {
        this.thisWeekSeconds = seconds;
      }),
      this.#keep(read, this.reads.between(first, last), (seconds) => {
        this.lastWeekSeconds = seconds;
      }),
    ]);
  }

  async #keep(
    read: number,
    answer: Read,
    kept: (seconds: number) => void,
  ): Promise<void> {
    const answered = await answer;
    if (read !== this.#latestRead) {
      return;
    }
    if (answered.status === "error") {
      this.onFailure(answered.error);
      return;
    }
    kept(answered.data);
  }
}
