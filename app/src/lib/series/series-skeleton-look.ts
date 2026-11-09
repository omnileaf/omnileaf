import { ABOUT_COVER, ABOUT_HEAD, ABOUT_LINES } from "./series-about-layout.ts";

export const ANDROID_SKELETON = {
  page: "flex flex-col gap-xl",
  head: ABOUT_HEAD,
  cover: ABOUT_COVER,
  lines: ABOUT_LINES,
  headLines: [
    "block-xl inline-9/10",
    "block-lg inline-3/5",
    "block-lg inline-1/2",
    "block-md inline-4/5",
  ],
  actions: "rounded-full block-native-button",
  note: "block-skeleton-note-android",
  card: "rounded-native-card block-skeleton-card-android",
  books: "flex flex-col gap-lg",
  bookLines: [
    "block-skeleton-book-title-android inline-3/5",
    "block-skeleton-book-line-android inline-2/5",
    "block-skeleton-book-title-android inline-7/10",
    "block-skeleton-book-line-android inline-2/5",
  ],
} as const;
