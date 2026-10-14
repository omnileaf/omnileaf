import type { BookReading, ReadMark } from "#lib/ipc/bindings.ts";

export interface BookActions {
  readonly read: "start" | "continue";
  readonly mark: ReadMark;
}

export function bookActions(reading: BookReading): BookActions {
  switch (reading.state) {
    case "notStarted":
      return { read: "start", mark: "read" };
    case "started":
      return { read: "continue", mark: "read" };
    case "read":
      return { read: "start", mark: "unread" };
  }
}
