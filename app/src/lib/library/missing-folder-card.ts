import type { MissingFolder } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import type { MissingFolderActions } from "./missing-folder-notices.ts";
import { remedyOf, wordingOf } from "./missing-folder-wording.ts";

export interface CardAction {
  readonly label: string;
  readonly run: () => void;
}

export interface MissingFolderCardContent {
  readonly title: string;
  readonly body: string;
  readonly actions: readonly CardAction[];
}

interface CardAsk {
  readonly missing: MissingFolder;
  readonly isStillFailing: boolean;
  readonly handlers: MissingFolderActions;
  readonly onHide: (missing: MissingFolder) => void;
}

export function missingFolderCardOf({
  missing,
  isStillFailing,
  handlers,
  onHide,
}: CardAsk): MissingFolderCardContent {
  const remedy = remedyOf(missing);
  const wording = wordingOf(missing, isStillFailing);
  const find = {
    label: m.missing_find_folder(),
    run: () => {
      handlers.find(missing);
    },
  };
  const hide = {
    label: m.missing_hide_again(),
    run: () => {
      onHide(missing);
    },
  };
  switch (remedy) {
    case "chooseAgain":
      return {
        ...wording,
        actions: [
          {
            label: m.missing_choose_again(),
            run: () => {
              handlers.find(missing);
            },
          },
          {
            label: m.missing_unlink(),
            run: () => {
              handlers.unlink(missing);
            },
          },
        ],
      };
    case "signIn":
      return {
        ...wording,
        actions: [
          {
            label: isStillFailing
              ? m.missing_sign_in_again()
              : m.missing_sign_in(),
            run: () => {
              handlers.signIn(missing);
            },
          },
        ],
      };
    case "tryAgain":
      return {
        ...wording,
        actions: [
          {
            label: m.missing_try_again(),
            run: () => {
              handlers.tryAgain(missing);
            },
          },
        ],
      };
    case "showOrFind":
      return missing.isShownAnyway
        ? {
            title: wording.title,
            body: m.missing_shown_body({ count: missing.hiddenSeries }),
            actions: [find, hide],
          }
        : {
            ...wording,
            actions: [
              {
                label: m.missing_show_anyway(),
                run: () => {
                  handlers.showAnyway(missing);
                },
              },
              find,
            ],
          };
  }
}
