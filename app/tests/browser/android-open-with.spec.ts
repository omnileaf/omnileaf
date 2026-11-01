import {
  CommandFailure,
  emitFakeEvent,
  type FakeChannel,
} from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, fakeAppInfo, test } from "./fixtures.ts";
import { BOOK_ID, NOT_STARTED, readerBook, servePages } from "./reader-book.ts";

const FILE_OPEN_REQUESTED = "file-open-requested";
const HANDED = "content://documents.test/document/42";
const OTHER_HANDED = "content://documents.test/document/43";

const queued: string[] = [];
const watching: FakeChannel<string>[] = [];
const copyingDone: (() => void)[] = [];
let isCopied = false;
let refusal: CommandFailure | undefined;

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    appInfo: () => fakeAppInfo("android"),
    openBook: (id) => ({ ...readerBook(NOT_STARTED), id }),
    watchOpenWith: (channel) => {
      watching.push(channel);
      return null;
    },
    queueDocumentToOpen: (uri) => {
      queued.push(uri);
      if (refusal !== undefined) {
        throw refusal;
      }
      return new Promise((finish) => {
        copyingDone.push(() => {
          isCopied = true;
          finish(null);
        });
      });
    },
    fileToOpen: () => {
      if (!isCopied) {
        return null;
      }
      isCopied = false;
      return { book: BOOK_ID, isInLibrary: false };
    },
  },
});

test.beforeEach(async ({ page, platform }) => {
  test.skip(platform !== "android", "Android's Open with and Share");
  queued.length = 0;
  watching.length = 0;
  copyingDone.length = 0;
  isCopied = false;
  refusal = undefined;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => watching.length).toBe(1);
});

test.describe(
  "a document handed to the app on an Android phone",
  { tag: "@native" },
  () => {
    test("is queued by its address and opens in the reader once copied", async ({
      page,
    }) => {
      await servePages(page);

      await watching[0]?.send(HANDED);
      await expect.poll(() => queued).toEqual([HANDED]);
      copyingDone[0]?.();
      await emitFakeEvent(page, FILE_OPEN_REQUESTED);

      await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
    });

    test("shows the app is opening the book until the copy is done", async ({
      page,
    }) => {
      await watching[0]?.send(HANDED);
      const busy = page.getByText("Opening this book");

      await expect(busy).toBeVisible();
      copyingDone[0]?.();

      await expect(busy).toBeHidden();
    });

    test("queues a second document handed to the running app", async () => {
      await watching[0]?.send(HANDED);
      await watching[0]?.send(OTHER_HANDED);

      await expect.poll(() => queued).toEqual([HANDED, OTHER_HANDED]);
    });

    test("says the book could not be opened when its document cannot be read", async ({
      page,
    }) => {
      refusal = new CommandFailure({
        code: "bookUnreadable",
        message: "the document could not be read",
      });

      await watching[0]?.send(HANDED);

      await expect(
        page.getByText("This book couldn't be opened"),
      ).toBeVisible();
      await expect(
        page.getByText("Its file may have moved, or be damaged."),
      ).toBeVisible();
      await expect(page.getByText("Opening this book")).toBeHidden();
    });

    test("says the type is not supported when the engine cannot open it yet", async ({
      page,
    }) => {
      refusal = new CommandFailure({
        code: "bookTypeUnsupported",
        message: "that kind of file cannot be opened yet",
      });

      await watching[0]?.send(HANDED);

      await expect(
        page.getByText("Omnileaf can't open this file"),
      ).toBeVisible();
      await expect(page).not.toHaveURL(/\/read\//);
    });
  },
);
