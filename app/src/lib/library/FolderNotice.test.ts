import { tick } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type {
  FolderScan,
  IpcErrorCode,
  ScanProgress,
} from "#lib/ipc/bindings.ts";
import { NOTICE_WINDOW_MS, Notices } from "#lib/notices/notices.ts";
import Toasts from "#lib/notices/Toasts.svelte";

import { clearToasts } from "../../../tests/components/clear-toasts";

import type { AddFolder } from "./add-folder";
import "../../app.css";

import AddFolderButton from "./AddFolderButton.svelte";
import { FolderAdding } from "./folder-adding.svelte";
import FolderNotice from "./FolderNotice.svelte";

type AddFolderResult = Awaited<ReturnType<AddFolder>>;

class PendingScan {
  report: (progress: ScanProgress) => void = () => undefined;
  finish: (result: AddFolderResult) => void = () => undefined;

  readonly addFolder: AddFolder = (onProgress) => {
    this.report = onProgress;
    return new Promise((resolve) => {
      this.finish = resolve;
    });
  };
}

const SAMPLE_SCAN: FolderScan = {
  name: "Sample Library",
  series: 3,
  books: 7,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

function answering(...results: AddFolderResult[]): AddFolder {
  return () => {
    const result = results.shift();
    if (result === undefined) {
      throw new Error("the picker was opened more often than the test expects");
    }
    return Promise.resolve(result);
  };
}

function scanned(scan: Partial<FolderScan>): AddFolderResult {
  return { status: "ok", data: { ...SAMPLE_SCAN, ...scan } };
}

function failed(code: IpcErrorCode): AddFolderResult {
  return { status: "error", error: { code, message: "from the backend" } };
}

const CANCELLED: AddFolderResult = { status: "ok", data: null };

afterEach(async () => {
  await clearToasts();
});

function toastSaying(text: string) {
  return page.getByRole("listitem").filter({ hasText: text });
}

async function renderWith(
  addFolder: AddFolder,
  { usesStandIns, onShow }: { usesStandIns: boolean; onShow?: () => void } = {
    usesStandIns: false,
  },
) {
  const notices = new Notices();
  const adding = new FolderAdding(addFolder, () => notices);
  const dismissals = { count: 0 };
  await render(AddFolderButton, { adding, placement: "empty-state" });
  const notice = await render(FolderNotice, {
    adding,
    notices,
    usesStandIns,
    onShow,
    onDismissed: () => {
      dismissals.count += 1;
    },
  });
  await render(Toasts, { notices, platform: "linux", theme: "light" });
  return {
    notices,
    unmount: notice.unmount,
    button: page.getByRole("button", { name: "Add a folder" }),
    status: page.elementLocator(notice.container).getByRole("status"),
    dismissals,
  };
}

test("reports the books the scan added from the picked folder", async () => {
  const { button } = await renderWith(answering(scanned({})));

  await button.click();

  await expect
    .element(toastSaying("Added 7 books from Sample Library"))
    .toBeVisible();
});

test("names the folder with the stand-in its name gives it while Screenshot mode is on", async () => {
  const { button } = await renderWith(answering(scanned({})), {
    usesStandIns: true,
  });

  await button.click();

  await expect
    .element(toastSaying("Added 7 books from Folder 571"))
    .toBeVisible();
});

test("counts a single book in the singular", async () => {
  const { button } = await renderWith(
    answering(scanned({ books: 1, series: 1 })),
  );

  await button.click();

  await expect
    .element(toastSaying("Added 1 book from Sample Library"))
    .toBeVisible();
});

test("formats the book count for the locale", async () => {
  const { button } = await renderWith(answering(scanned({ books: 1234 })));

  await button.click();

  await expect
    .element(toastSaying("Added 1,234 books from Sample Library"))
    .toBeVisible();
});

test("says so in the page when the folder holds no books", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 0, series: 0 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found no books in Sample Library.");
  expect(page.getByRole("listitem").elements()).toEqual([]);
});

test("mentions the books and folders inside it that couldn't be read", async () => {
  const { button } = await renderWith(
    answering(scanned({ unreadableBooks: 1, unreadableFolders: 2 })),
  );

  await button.click();

  await expect
    .element(
      toastSaying("Added 7 books").getByText(
        "Couldn't read 1 book in it. Couldn't read 2 folders inside it.",
      ),
    )
    .toBeVisible();
});

test("says which books are in a format this version can't open yet", async () => {
  const { button } = await renderWith(
    answering(scanned({ unreadableBooks: 1, unsupportedBooks: 16 })),
  );

  await button.click();

  await expect
    .element(
      toastSaying("Added 7 books").getByText(
        "Couldn't read 1 book in it. 16 books are CBR files, which this version can't open yet.",
      ),
    )
    .toBeVisible();
});

test("shows nothing when the picker is cancelled", async () => {
  const { button, status } = await renderWith(answering(CANCELLED));

  await button.click();

  await expect.element(button).toBeEnabled();
  expect(page.getByRole("listitem").elements()).toEqual([]);
  await expect.element(status).toHaveTextContent("");
});

test("puts the result away when it is dismissed", async () => {
  const { button } = await renderWith(answering(scanned({})));
  await button.click();
  const result = toastSaying("Added 7 books");

  await result.getByRole("button", { name: "Dismiss" }).click();

  await expect.element(result).not.toBeInTheDocument();
});

test("tells the page once the notice in it is dismissed", async () => {
  const { button, status, dismissals } = await renderWith(
    answering(scanned({ books: 0, series: 0 })),
  );
  await button.click();

  await status.getByRole("button", { name: "Dismiss" }).click();

  expect(dismissals.count).toBe(1);
});

test("offers to show the books when the page can", async () => {
  const shown = { count: 0 };
  const { button } = await renderWith(answering(scanned({})), {
    usesStandIns: false,
    onShow: () => {
      shown.count += 1;
    },
  });
  await button.click();

  await toastSaying("Added 7 books")
    .getByRole("button", { name: "Show" })
    .click();

  expect(shown.count).toBe(1);
});

test("offers no Show where the books are already in view", async () => {
  const { button } = await renderWith(answering(scanned({})));

  await button.click();

  const result = toastSaying("Added 7 books");
  await expect.element(result).toBeVisible();
  expect(result.getByRole("button", { name: "Show" }).elements()).toEqual([]);
});

test("turns the finding toast into the result in the same place", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();
  scan.report({ stage: "finding", found: 3 });
  const finding = toastSaying("Finding books");
  await expect.element(finding).toBeVisible();
  const shownWhileFinding = finding.element();

  scan.finish(scanned({}));

  await expect
    .element(toastSaying("Added 7 books from Sample Library"))
    .toBeVisible();
  expect(toastSaying("Added 7 books").element()).toBe(shownWhileFinding);
  expect(page.getByRole("listitem").elements()).toHaveLength(1);
});

test("keeps finding books for as long as the scan runs", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();
  scan.report({ stage: "reading", scanned: 1, total: 7 });
  const finding = toastSaying("Finding books");
  await expect.element(finding).toBeVisible();

  vi.advanceTimersByTime(NOTICE_WINDOW_MS * 10);

  await expect.element(finding).toHaveAttribute("data-removed", "false");
});

test("closes the result by itself after a few seconds", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const { button } = await renderWith(answering(scanned({})));
  await button.click();
  const result = toastSaying("Added 7 books");
  await expect.element(result).toBeVisible();

  vi.advanceTimersByTime(NOTICE_WINDOW_MS);

  await expect.element(result).toHaveAttribute("data-removed", "true");
});

test.each<[IpcErrorCode, string, string]>([
  [
    "folderUnreadable",
    "Couldn't read that folder",
    "Omnileaf may not be allowed to open it, or it may have moved. Your library hasn't changed.",
  ],
  [
    "folderPickerUnavailable",
    "Adding folders isn't available on this device yet",
    "It's coming in a later version of Omnileaf.",
  ],
  [
    "folderChooserMissing",
    "Couldn't open a folder chooser",
    "Omnileaf opens folders through xdg-desktop-portal. Install it and the portal for your desktop, such as xdg-desktop-portal-gnome, xdg-desktop-portal-kde or xdg-desktop-portal-gtk. Your library hasn't changed.",
  ],
  [
    "internal",
    "Couldn't add the folder",
    "Something went wrong inside Omnileaf. Your library hasn't changed.",
  ],
  [
    "folderNotFound",
    "Couldn't add the folder",
    "Something went wrong inside Omnileaf. Your library hasn't changed.",
  ],
  [
    "homeFolderKept",
    "Couldn't add the folder",
    "Something went wrong inside Omnileaf. Your library hasn't changed.",
  ],
])("warns when adding fails with %s", async (code, title, body) => {
  const { button } = await renderWith(answering(failed(code)));

  await button.click();

  const warning = toastSaying(title);
  await expect.element(warning.getByText(title, { exact: true })).toBeVisible();
  await expect.element(warning.getByText(body, { exact: true })).toBeVisible();
  await expect.element(warning).toHaveAttribute("aria-live", "assertive");
});

test.each<[IpcErrorCode, string]>([
  ["folderUnreadable", "Choose another folder"],
  ["folderChooserMissing", "Try again"],
  ["internal", "Try again"],
])("opens the picker again from the %s warning", async (code, retry) => {
  const { button } = await renderWith(answering(failed(code), scanned({})));
  await button.click();

  await page.getByRole("button", { name: retry }).click();

  await expect
    .element(toastSaying("Added 7 books from Sample Library"))
    .toBeVisible();
});

test("offers no retry when the device has no folder picker", async () => {
  const { button } = await renderWith(
    answering(failed("folderPickerUnavailable")),
  );

  await button.click();

  const warning = toastSaying("Adding folders isn't available");
  await expect.element(warning).toBeVisible();
  expect(warning.getByRole("button").elements()).toHaveLength(1);
  await expect
    .element(warning.getByRole("button"))
    .toHaveAccessibleName("Dismiss");
});

test("puts a failure warning away once a folder is added", async () => {
  const { button } = await renderWith(
    answering(failed("folderUnreadable"), scanned({})),
  );
  await button.click();
  const warning = toastSaying("Couldn't read that folder");
  await expect.element(warning).toBeVisible();

  await button.click();

  await expect
    .element(toastSaying("Added 7 books from Sample Library"))
    .toBeVisible();
  await expect.element(warning).not.toBeInTheDocument();
});

test("disables the button while the folder is being added and scanned", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);

  await button.click();
  await expect.element(button).toBeDisabled();
  scan.report({ stage: "reading", scanned: 0, total: 7 });
  await expect.element(button).toBeDisabled();
  scan.finish(CANCELLED);

  await expect.element(button).toBeEnabled();
});

test("shows how far the scan has got while it runs", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();

  scan.report({ stage: "reading", scanned: 32, total: 100 });

  const bar = page.getByRole("progressbar", {
    name: "Finding books",
    exact: true,
  });
  await expect.element(bar).toHaveAttribute("aria-valuenow", "32");
  await expect.element(bar).toHaveAttribute("aria-valuemax", "100");
  await expect.element(bar).toHaveAccessibleDescription("32 of 100 books");
});

test("counts the books found so far before the total is known", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();

  scan.report({ stage: "finding", found: 214 });

  const bar = page.getByRole("progressbar", {
    name: "Finding books",
    exact: true,
  });
  await expect.element(bar).toHaveAccessibleDescription("214 so far");
  await expect.element(bar).not.toHaveAttribute("aria-valuenow");
});

test("eases the count found so far up instead of jumping to it", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();
  scan.report({ stage: "finding", found: 0 });
  await tick();

  scan.report({ stage: "finding", found: 214 });
  await tick();

  expect(page.getByText("214 so far").query()).toBeNull();
  await expect.element(page.getByText("214 so far")).toBeVisible();
});

test("announces that books are being found without announcing each count", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();
  scan.report({ stage: "finding", found: 0 });

  scan.report({ stage: "reading", scanned: 32, total: 100 });

  const count = toastSaying("Finding books").getByText("32 of 100 books");
  await expect.element(count).toBeVisible();
  await expect.element(count).toHaveAttribute("aria-hidden", "true");
});

test("says it is finding books before the scan has counted them", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();

  scan.report({ stage: "finding", found: 0 });

  const bar = page.getByRole("progressbar", {
    name: "Finding books",
    exact: true,
  });
  await expect.element(bar).toBeVisible();
  await expect.element(bar).not.toHaveAttribute("aria-valuenow");
});

test("keeps the result when word of the scan arrives after it finished", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();
  scan.finish(scanned({}));
  const result = toastSaying("Added 7 books from Sample Library");
  await expect.element(result).toBeVisible();

  scan.report({ stage: "reading", scanned: 7, total: 7 });

  await expect.element(result).toBeVisible();
  expect(page.getByRole("listitem").elements()).toHaveLength(1);
});

test("withdraws its warning once it's gone from the page", async () => {
  const { button, unmount } = await renderWith(
    answering(failed("folderUnreadable")),
  );
  await button.click();
  const warning = toastSaying("Couldn't read that folder");
  await expect.element(warning).toBeVisible();

  await unmount();

  await expect.element(warning).not.toBeInTheDocument();
});
