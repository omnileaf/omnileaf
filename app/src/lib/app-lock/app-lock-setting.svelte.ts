import {
  type AppLock,
  type AppLockTurning,
  commands,
  type IpcError,
  type LockAfter,
} from "#lib/ipc/bindings.ts";

type Answered<Data> =
  | { readonly status: "ok"; readonly data: Data }
  | { readonly status: "error"; readonly error: IpcError };

export interface AppLockChanges {
  readonly turnOn: (promptTitle: string) => Promise<Answered<AppLockTurning>>;
  readonly turnOff: () => Promise<Answered<null>>;
  readonly chooseLockAfter: (lockAfter: LockAfter) => Promise<Answered<null>>;
  readonly hideContentInRecents: (isHidden: boolean) => Promise<Answered<null>>;
}

export interface AppLockAnswers {
  readonly onFailure: (error: IpcError) => void;
  readonly onNoScreenLock: () => void;
}

export const APP_LOCK_CHANGES: AppLockChanges = {
  turnOn: commands.turnAppLockOn,
  turnOff: commands.turnAppLockOff,
  chooseLockAfter: commands.chooseLockAfter,
  hideContentInRecents: commands.hideContentInRecents,
};

export class AppLockSetting {
  lock: AppLock;
  isAsking = $state(false);

  constructor(
    lock: AppLock,
    private readonly changes: AppLockChanges,
    private readonly answers: AppLockAnswers,
  ) {
    this.lock = $state(lock);
  }

  async turnOn(promptTitle: string): Promise<void> {
    this.isAsking = true;
    try {
      const turned = await this.changes.turnOn(promptTitle);
      if (this.#isChanged(turned)) {
        this.#follow(turned.data);
      }
    } finally {
      this.isAsking = false;
    }
  }

  async turnOff(): Promise<void> {
    if (this.#isChanged(await this.changes.turnOff())) {
      this.lock = { ...this.lock, isOn: false };
    }
  }

  async chooseLockAfter(lockAfter: LockAfter): Promise<void> {
    if (this.#isChanged(await this.changes.chooseLockAfter(lockAfter))) {
      this.lock = { ...this.lock, lockAfter };
    }
  }

  async hideContentInRecents(isHidden: boolean): Promise<void> {
    if (this.#isChanged(await this.changes.hideContentInRecents(isHidden))) {
      this.lock = { ...this.lock, hidesContentInRecents: isHidden };
    }
  }

  #follow(turning: AppLockTurning): void {
    if (turning === "turnedOn") {
      this.lock = { ...this.lock, isOn: true };
    } else if (turning === "noScreenLock") {
      this.answers.onNoScreenLock();
    }
  }

  #isChanged<Data>(
    answered: Answered<Data>,
  ): answered is { readonly status: "ok"; readonly data: Data } {
    if (answered.status === "error") {
      this.answers.onFailure(answered.error);
      return false;
    }
    return true;
  }
}
