import { createContext } from "svelte";

/** Whether the reader is showing a book, for the parts of the app drawn around it. */
export class BookPresence {
  isOpen = $state(false);
}

export const [getBookPresence, setBookPresence] = createContext<BookPresence>();
