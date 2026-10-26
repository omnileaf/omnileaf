import { createContext } from "svelte";

export class BookPresence {
  isOpen = $state(false);
  isBeingRead = $state(false);
}

export const [getBookPresence, setBookPresence] = createContext<BookPresence>();
