import type {
  LastSeen,
  VersionNotes,
  WhatsNewNotice,
} from "#lib/ipc/bindings.ts";
import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const SEEN_KEY = "omnileaf.whatsNewSeen";

export type AskNotice = (lastSeen: LastSeen) => Promise<WhatsNewNotice>;

export class WhatsNewSeen {
  readonly #stored: StoredPreference;
  #isShownThisRun = false;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, SEEN_KEY);
  }

  async notesToShow(
    installed: string,
    ask: AskNotice,
  ): Promise<VersionNotes | undefined> {
    if (this.#isShownThisRun) {
      return undefined;
    }
    const notice = await ask(this.#lastSeen());
    switch (notice.kind) {
      case "show":
        return notice.notes;
      case "record":
        this.#stored.writeIfPossible(installed);
        return undefined;
      case "nothing":
        return undefined;
    }
  }

  shown(): void {
    this.#isShownThisRun = true;
  }

  dismissed(notes: VersionNotes): void {
    this.#isShownThisRun = true;
    this.#stored.writeIfPossible(notes.version);
  }

  async recordFirstInstall(installed: string, ask: AskNotice): Promise<void> {
    const notice = await ask({ kind: "firstInstall" });
    if (notice.kind === "record") {
      this.#stored.writeIfPossible(installed);
    }
  }

  #lastSeen(): LastSeen {
    const version = this.#stored.read();
    return version === null
      ? { kind: "notRecorded" }
      : { kind: "version", version };
  }
}

let forApp: WhatsNewSeen | undefined;

export function whatsNewSeenForApp(): WhatsNewSeen {
  forApp ??= new WhatsNewSeen(browserPreferenceStore());
  return forApp;
}
