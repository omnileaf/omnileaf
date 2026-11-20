import { m } from "#lib/paraglide/messages.js";
import {
  commands,
  type IpcError,
  type UpdateNoticeTurning,
  type UpdateNoticeWords,
  type UpdateNotices,
} from "#lib/ipc/bindings.ts";

type Answered<Data> =
  | { readonly status: "ok"; readonly data: Data }
  | { readonly status: "error"; readonly error: IpcError };

export interface UpdateNoticeAsks {
  readonly read: () => Promise<Answered<UpdateNotices>>;
  readonly turnOn: () => Promise<Answered<UpdateNoticeTurning>>;
  readonly turnOff: () => Promise<Answered<null>>;
  readonly rememberWords: (words: UpdateNoticeWords) => Promise<Answered<null>>;
}

const UPDATE_NOTICE_ASKS: UpdateNoticeAsks = {
  read: commands.updateNotices,
  turnOn: commands.turnUpdateNoticesOn,
  turnOff: commands.turnUpdateNoticesOff,
  rememberWords: commands.rememberUpdateNoticeWords,
};

const VERSION_PLACEHOLDER = "{version}";

export function noticeWords(): UpdateNoticeWords {
  return {
    channel: m.update_notice_channel(),
    title: m.about_update_available({ version: VERSION_PLACEHOLDER }),
    viewRelease: m.update_banner_view_release(),
    skip: m.update_banner_skip(),
  };
}

export class UpdateNoticeSetting {
  isOn = $state(false);
  isBlocked = $state(false);
  isAsking = $state(false);

  constructor(
    private readonly onFailure: (error: IpcError) => void,
    private readonly asks: UpdateNoticeAsks,
  ) {}

  async load(): Promise<void> {
    const read = await this.asks.read();
    if (read.status === "error") {
      this.#report(read.error);
      return;
    }
    this.isOn = read.data.isOn && read.data.canShow;
    this.isBlocked = read.data.isOn && !read.data.canShow;
  }

  async turnOn(words: UpdateNoticeWords): Promise<void> {
    this.isAsking = true;
    try {
      const remembered = await this.asks.rememberWords(words);
      if (remembered.status === "error") {
        this.#report(remembered.error);
        return;
      }
      const turned = await this.asks.turnOn();
      if (turned.status === "error") {
        this.#report(turned.error);
        return;
      }
      this.isOn = turned.data === "turnedOn";
      this.isBlocked = turned.data === "blocked";
    } finally {
      this.isAsking = false;
    }
  }

  async keepWords(words: UpdateNoticeWords): Promise<void> {
    const remembered = await this.asks.rememberWords(words);
    if (remembered.status === "error") {
      this.#report(remembered.error);
    }
  }

  async turnOff(): Promise<void> {
    const turned = await this.asks.turnOff();
    if (turned.status === "error") {
      this.#report(turned.error);
      return;
    }
    this.isOn = false;
  }

  #report(error: IpcError): void {
    const { onFailure } = this;
    onFailure(error);
  }
}

let appUpdateNotices: UpdateNoticeSetting | undefined;

export function updateNoticesForApp(): UpdateNoticeSetting {
  appUpdateNotices ??= new UpdateNoticeSetting((error) => {
    reportError(error);
  }, UPDATE_NOTICE_ASKS);
  return appUpdateNotices;
}
