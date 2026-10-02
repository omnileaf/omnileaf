import type { LucideIcon } from "@lucide/svelte";

export type NoticeTone = "info" | "warning";

export interface NoticeAction {
  readonly label: string;
  readonly emphasis: "primary" | "quiet";
  readonly run: () => void;
}

export interface Notice {
  readonly tone: NoticeTone;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly actions: readonly NoticeAction[];
}

/** The notice on screen, at most one: showing another replaces it. */
export class Notices {
  shown: Notice | undefined = $state.raw();

  show(notice: Notice): void {
    this.shown = notice;
  }

  dismiss(): void {
    this.shown = undefined;
  }

  withdraw(notice: Notice): void {
    if (this.shown === notice) {
      this.dismiss();
    }
  }

  act(action: NoticeAction): void {
    this.dismiss();
    action.run();
  }
}
