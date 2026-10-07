import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import type { FolderScan, IpcErrorCode, ScanProgress } from "$lib/ipc/bindings";
import NoticeHost from "$lib/notices/NoticeHost.svelte";
import { Notices } from "$lib/notices/notices.svelte";

import type { AddFolder } from "./add-folder";
import AddFolderButton from "./AddFolderButton.svelte";
import { FolderAdding } from "./folder-adding.svelte";
import FolderNotice from "./FolderNotice.svelte";

type AddFolderResult = Awaited<ReturnType<AddFolder>>;

/** A folder being added whose scan the test steps through and then finishes. */
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

async function renderWith(
  addFolder: AddFolder,
  { usesStandIns } = { usesStandIns: false },
) {
  const notices = new Notices();
  const adding = new FolderAdding(addFolder, () => notices);
  const dismissals = { count: 0 };
  await render(AddFolderButton, { adding, placement: "empty-state" });
  const notice = await render(FolderNotice, {
    adding,
    usesStandIns,
    onDismissed: () => {
      dismissals.count += 1;
    },
  });
  await render(NoticeHost, { notices, platform: "linux" });
  return {
    notices,
    unmount: notice.unmount,
    button: page.getByRole("button", { name: "Add a folder" }),
    status: page.elementLocator(notice.container).getByRole("status"),
    dismissals,
  };
}

test("reports the books and series the scan found in the picked folder", async () => {
  const { button, status } = await renderWith(answering(scanned({})));

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");
});

test("names the folder with a stand-in while Screenshot mode is on", async () => {
  const { button, status } = await renderWith(answering(scanned({})), {
    usesStandIns: true,
  });

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Folder 01.");
});

test("counts a single book in a single series in the singular", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 1, series: 1 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 1 book in 1 series in Sample Library.");
});

test("formats the book count for the locale", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 1234 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 1,234 books in 3 series in Sample Library.");
});

test("says so when the folder holds no books", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ books: 0, series: 0 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found no books in Sample Library.");
});

test("mentions the books and folders inside it that couldn't be read", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ unreadableBooks: 1, unreadableFolders: 2 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent(
      "Found 7 books in 3 series in Sample Library. Couldn't read 1 book in it. Couldn't read 2 folders inside it.",
    );
});

test("says which books are in a format this version can't open yet", async () => {
  const { button, status } = await renderWith(
    answering(scanned({ unreadableBooks: 1, unsupportedBooks: 16 })),
  );

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent(
      "Found 7 books in 3 series in Sample Library. Couldn't read 1 book in it. 16 books are CBR or CB7 files, which this version can't open yet.",
    );
});

test("clears the last result when the picker is cancelled", async () => {
  const { button, status } = await renderWith(
    answering(scanned({}), CANCELLED),
  );
  await button.click();
  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");

  await button.click();

  await expect.element(status).toHaveTextContent("");
});

test("clears the result when it is dismissed", async () => {
  const { button, status } = await renderWith(answering(scanned({})));
  await button.click();
  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");

  await status.getByRole("button", { name: "Dismiss" }).click();

  await expect.element(status).toHaveTextContent("");
});

test("tells the page once the notice is dismissed", async () => {
  const { button, status, dismissals } = await renderWith(
    answering(scanned({})),
  );
  await button.click();

  await status.getByRole("button", { name: "Dismiss" }).click();

  expect(dismissals.count).toBe(1);
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
  const { notices, button } = await renderWith(answering(failed(code)));

  await button.click();

  await expect
    .poll(() => notices.shown)
    .toMatchObject({ tone: "warning", title, body });
});

test.each<[IpcErrorCode, string]>([
  ["folderUnreadable", "Choose another folder"],
  ["internal", "Try again"],
])("opens the picker again from the %s warning", async (code, retry) => {
  const { status, button } = await renderWith(
    answering(failed(code), scanned({})),
  );
  await button.click();

  await page.getByRole("button", { name: retry }).click();

  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");
});

test("offers no retry when the device has no folder picker", async () => {
  const { notices, button } = await renderWith(
    answering(failed("folderPickerUnavailable")),
  );

  await button.click();

  await expect.poll(() => notices.shown?.actions).toEqual([]);
});

test("puts a failure warning away once a folder is added", async () => {
  const { notices, button, status } = await renderWith(
    answering(failed("folderUnreadable"), scanned({})),
  );
  await button.click();
  await expect.poll(() => notices.shown).toBeDefined();

  await button.click();

  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");
  expect(notices.shown).toBeUndefined();
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
  await expect.element(bar).toHaveAttribute("value", "32");
  await expect.element(bar).toHaveAttribute("max", "100");
  await expect.element(bar).toHaveAccessibleDescription("32 of 100 books");
});

test("announces that books are being found without announcing each count", async () => {
  const scan = new PendingScan();
  const { button, status } = await renderWith(scan.addFolder);
  await button.click();
  scan.report({ stage: "finding" });

  scan.report({ stage: "reading", scanned: 32, total: 100 });

  await expect.element(page.getByText("32 of 100 books")).toBeVisible();
  await expect.element(status).toHaveTextContent("Finding books");
  await expect.element(status).not.toHaveTextContent("32");
});

test("says it is finding books before the scan has counted them", async () => {
  const scan = new PendingScan();
  const { button } = await renderWith(scan.addFolder);
  await button.click();

  scan.report({ stage: "finding" });

  const bar = page.getByRole("progressbar", {
    name: "Finding books",
    exact: true,
  });
  await expect.element(bar).toBeVisible();
  await expect.element(bar).not.toHaveAttribute("value");
});

test("keeps the result when word of the scan arrives after it finished", async () => {
  const scan = new PendingScan();
  const { button, status } = await renderWith(scan.addFolder);
  await button.click();
  scan.finish(scanned({}));
  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");

  scan.report({ stage: "reading", scanned: 7, total: 7 });

  await expect
    .element(status)
    .toHaveTextContent("Found 7 books in 3 series in Sample Library.");
});

test("withdraws its warning once it's gone from the page", async () => {
  const { notices, button, unmount } = await renderWith(
    answering(failed("folderUnreadable")),
  );
  await button.click();
  await expect.poll(() => notices.shown).toBeDefined();

  await unmount();

  expect(notices.shown).toBeUndefined();
});
