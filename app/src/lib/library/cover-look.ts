import type { CoversPerRow } from "$lib/ipc/bindings";

/** The classes a grid of covers takes from how many covers each size's rows hold, as the boards space and letter them. */
export interface CoverLook {
  readonly gap: string;
  readonly title: string;
  readonly bookCount: string;
}

interface SizeLook {
  /** The fewest covers per row this look is drawn for, up to the next look's. */
  readonly from: number;
  readonly look: CoverLook;
}

const PHONE_LOOKS: readonly SizeLook[] = [
  {
    from: 5,
    look: {
      gap: "max-medium:gap-sm",
      title: "max-medium:text-cover-title-tiny",
      bookCount: "max-medium:hidden",
    },
  },
  {
    from: 4,
    look: {
      gap: "max-medium:gap-cover-gap-tight",
      title: "max-medium:text-cover-title-small",
      bookCount: "max-medium:hidden",
    },
  },
  {
    from: 0,
    look: {
      gap: "max-medium:gap-cover-gap",
      title: "max-medium:text-cover-title",
      bookCount: "",
    },
  },
];

const TABLET_LOOKS: readonly SizeLook[] = [
  {
    from: 7,
    look: {
      gap: "medium:max-large:gap-cover-gap",
      title: "medium:max-large:text-cover-title-wide",
      bookCount: "",
    },
  },
  {
    from: 0,
    look: {
      gap: "medium:max-large:gap-cover-gap-wide",
      title: "medium:max-large:text-cover-title-wide",
      bookCount: "",
    },
  },
];

const DESKTOP_LOOKS: readonly SizeLook[] = [
  {
    from: 9,
    look: {
      gap: "large:gap-cover-gap",
      title: "large:text-cover-title-small",
      bookCount: "large:hidden",
    },
  },
  {
    from: 7,
    look: {
      gap: "large:gap-cover-gap-loose",
      title: "large:text-cover-title",
      bookCount: "",
    },
  },
  {
    from: 0,
    look: {
      gap: "large:gap-xl",
      title: "large:text-cover-title-wide",
      bookCount: "",
    },
  },
];

const NO_LOOK: CoverLook = { gap: "", title: "", bookCount: "" };

function lookFor(looks: readonly SizeLook[], coversPerRow: number): CoverLook {
  return looks.find(({ from }) => coversPerRow >= from)?.look ?? NO_LOOK;
}

export function coverLook(coversPerRow: CoversPerRow): CoverLook {
  const looks = [
    lookFor(PHONE_LOOKS, coversPerRow.phone),
    lookFor(TABLET_LOOKS, coversPerRow.tablet),
    lookFor(DESKTOP_LOOKS, coversPerRow.desktop),
  ];
  return {
    gap: looks.map(({ gap }) => gap).join(" "),
    title: looks.map(({ title }) => title).join(" "),
    bookCount: looks.map(({ bookCount }) => bookCount).join(" "),
  };
}
