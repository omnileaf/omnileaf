import { Channel } from "@tauri-apps/api/core";

import { commands, type PageTurn, type Platform } from "#lib/ipc/bindings.ts";

type CommandResult = Awaited<ReturnType<typeof commands.releaseVolumeKeys>>;
type FollowTurns = (turn: PageTurn) => void;
type ReportFailure = (error: unknown) => void;

export interface VolumeKeyCommands {
  readonly capture: (onTurn: FollowTurns) => Promise<CommandResult>;
  readonly release: () => Promise<CommandResult>;
}

const HAS_VOLUME_KEYS = {
  android: true,
  ios: false,
  linux: false,
  macos: false,
  windows: false,
} satisfies Record<Platform, boolean>;

export function hasVolumeKeys(platform: Platform): boolean {
  return HAS_VOLUME_KEYS[platform];
}

function reportRefusal(onError: ReportFailure) {
  return (result: CommandResult) => {
    if (result.status === "error") {
      onError(result.error);
    }
  };
}

export class VolumeKeys {
  readonly #commands: VolumeKeyCommands;
  #sent: Promise<void> = Promise.resolve();
  #holder: object | undefined;

  constructor(volumeKeyCommands: VolumeKeyCommands) {
    this.#commands = volumeKeyCommands;
  }

  follow(onTurn: FollowTurns, onError: ReportFailure): () => void {
    const holder = {};
    this.#holder = holder;
    this.#send(() => this.#commands.capture(onTurn), onError);
    return () => {
      if (this.#holder !== holder) {
        return;
      }
      this.#holder = undefined;
      this.#send(() => this.#commands.release(), onError);
    };
  }

  #send(command: () => Promise<CommandResult>, onError: ReportFailure): void {
    this.#sent = this.#sent
      .then(command)
      .then(reportRefusal(onError))
      .catch(onError);
  }
}

const VOLUME_KEYS = new VolumeKeys({
  capture: (onTurn) => commands.captureVolumeKeys(new Channel(onTurn)),
  release: () => commands.releaseVolumeKeys(),
});

export function followVolumeKeys(
  onTurn: FollowTurns,
  onError: ReportFailure,
): () => void {
  return VOLUME_KEYS.follow(onTurn, onError);
}
