import type { BookReading, Platform, ReadMark } from "#lib/ipc/bindings.ts";

export interface BookActions {
  readonly read: "start" | "continue";
  readonly mark: ReadMark;
  readonly marks: readonly ReadMark[];
}

export function bookActions(reading: BookReading): BookActions {
  switch (reading.state) {
    case "notStarted":
      return { read: "start", mark: "read", marks: ["read"] };
    case "started":
      return { read: "continue", mark: "read", marks: ["read", "unread"] };
    case "read":
      return { read: "start", mark: "unread", marks: ["unread"] };
  }
}

export function hasRowDelete(platform: Platform): boolean {
  return platform !== "ios";
}
