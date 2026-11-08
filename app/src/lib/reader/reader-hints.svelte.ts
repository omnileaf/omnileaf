import {
  browserPreferenceStore,
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const TAP_GUIDE_KEY = "omnileaf.readerHints.tapGuide";
const RESUME_NOTICE_KEY = "omnileaf.readerHints.resumeNotice";
const REPLAY_KEY = "omnileaf.readerHints.replayGuide";
const STORED_ON = "on";
const STORED_OFF = "off";
const STORED_ARMED = "armed";
const STORED_IDLE = "idle";

function choiceIn(stored: string | null): boolean | undefined {
  if (stored === STORED_ON) {
    return true;
  }
  return stored === STORED_OFF ? false : undefined;
}

export class ReaderHints {
  #isReplayArmed = $state(false);
  #tapGuide: boolean | undefined = $state();
  #resumeNotice: boolean | undefined = $state();

  readonly #tapGuideStored: StoredPreference;
  readonly #resumeNoticeStored: StoredPreference;
  readonly #replayStored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#tapGuideStored = new StoredPreference(store, TAP_GUIDE_KEY);
    this.#resumeNoticeStored = new StoredPreference(store, RESUME_NOTICE_KEY);
    this.#replayStored = new StoredPreference(store, REPLAY_KEY);
    this.#tapGuide = choiceIn(this.#tapGuideStored.read());
    this.#resumeNotice = choiceIn(this.#resumeNoticeStored.read());
    this.#isReplayArmed = this.#replayStored.read() === STORED_ARMED;
  }

  get isReplayArmed(): boolean {
    return this.#isReplayArmed;
  }

  get showsTapGuide(): boolean {
    return this.#tapGuide ?? true;
  }

  showsResumeNotice(isOnPhone: boolean): boolean {
    return this.#resumeNotice ?? !isOnPhone;
  }

  isGuideDue(isSeen: boolean): boolean {
    return this.#isReplayArmed || (this.showsTapGuide && !isSeen);
  }

  turnTapGuide(isOn: boolean): void {
    this.#tapGuide = isOn;
    this.#tapGuideStored.writeIfPossible(isOn ? STORED_ON : STORED_OFF);
  }

  turnResumeNotice(isOn: boolean): void {
    this.#resumeNotice = isOn;
    this.#resumeNoticeStored.writeIfPossible(isOn ? STORED_ON : STORED_OFF);
  }

  armReplay(): void {
    this.#isReplayArmed = true;
    this.#replayStored.writeIfPossible(STORED_ARMED);
  }

  disarmReplay(): void {
    this.#isReplayArmed = false;
    this.#replayStored.writeIfPossible(STORED_IDLE);
  }
}

export function readerHints(): ReaderHints {
  return new ReaderHints(browserPreferenceStore());
}
