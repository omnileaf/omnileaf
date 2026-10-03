import type { CoversPerRow } from "$lib/ipc/bindings";

/** The classes a grid of covers takes from how many covers each size's rows hold, spaced tighter and lettered smaller as rows fill. */
export interface CoverLook {
  readonly gap: string;
  readonly title: string;
  readonly bookCount: string;
}

interface DenserLook {
  /** The fewest covers per row this look is drawn for, up to the next look's. */
  readonly from: number;
  readonly look: CoverLook;
}

/** A size's look for its fewest covers per row, and the denser looks that replace it as rows fill, densest first. */
interface SizeLooks {
  readonly base: CoverLook;
  readonly denser: readonly DenserLook[];
}

const PHONE_LOOKS: SizeLooks = {
  base: {
    gap: "max-medium:gap-cover-gap",
    title: "max-medium:text-cover-title",
    bookCount: "",
  },
  denser: [
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
  ],
};

const TABLET_LOOKS: SizeLooks = {
  base: {
    gap: "medium:max-large:gap-cover-gap-wide",
    title: "medium:max-large:text-cover-title-wide",
    bookCount: "",
  },
  denser: [
    {
      from: 7,
      look: {
        gap: "medium:max-large:gap-cover-gap",
        title: "medium:max-large:text-cover-title-wide",
        bookCount: "",
      },
    },
  ],
};

const DESKTOP_LOOKS: SizeLooks = {
  base: {
    gap: "large:gap-xl",
    title: "large:text-cover-title-wide",
    bookCount: "",
  },
  denser: [
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
  ],
};

function lookFor(looks: SizeLooks, coversPerRow: number): CoverLook {
  return (
    looks.denser.find(({ from }) => coversPerRow >= from)?.look ?? looks.base
  );
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
