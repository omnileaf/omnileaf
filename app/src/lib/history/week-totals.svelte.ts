import {
  type HistoryCalendar,
  lastWeekDays,
} from "#lib/history/history-days.ts";
import type { LocalDay } from "#lib/history/local-date.ts";
import type { commands, ReadingWeek } from "#lib/ipc/bindings.ts";

export interface WeekReads {
  week(
    weekStart: LocalDay,
    today: LocalDay,
  ): ReturnType<typeof commands.readingWeek>;
  between(
    first: LocalDay,
    last: LocalDay,
  ): ReturnType<typeof commands.readingTimeBetween>;
}

type Answer<Value> =
  { status: "ok"; data: Value } | { status: "error"; error: unknown };

export class WeekTotals {
  thisWeek: ReadingWeek | undefined = $state();
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
      this.#keep(
        read,
        this.reads.week(calendar.weekStart, calendar.today),
        (week) => {
          this.thisWeek = week;
        },
      ),
      this.#keep(read, this.reads.between(first, last), (seconds) => {
        this.lastWeekSeconds = seconds;
      }),
    ]);
  }

  async #keep<Value>(
    read: number,
    answer: Promise<Answer<Value>>,
    kept: (value: Value) => void,
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
