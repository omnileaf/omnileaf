import type { BookReading } from "#lib/ipc/bindings.ts";

/** The page a book opens on, counting from 0: where reading goes on from, or the first page. */
export function startPage(reading: BookReading): number {
  switch (reading.state) {
    case "started":
      return reading.page === null ? 0 : reading.page - 1;
    case "notStarted":
    case "read":
      return 0;
  }
}
