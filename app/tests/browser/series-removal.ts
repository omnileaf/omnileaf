import type { FakeBackend } from "./fake-backend.ts";

type Asked = {
  targets: Parameters<FakeBackend["removeFromLibrary"]>[0];
  deleteFiles: boolean;
};

export class FakeRemoval {
  asked: Asked[] = [];
  outcome: "trashed" | "failed" = "trashed";

  reset(): void {
    this.asked = [];
    this.outcome = "trashed";
  }

  backend(): Pick<FakeBackend, "previewRemoval" | "removeFromLibrary"> {
    return {
      previewRemoval: (targets) => ({
        books: targets.length,
        files: targets.length * 3,
        folders: 1,
      }),
      removeFromLibrary: (targets, deleteFiles) => {
        this.asked = [...this.asked, { targets: [...targets], deleteFiles }];
        return {
          removedSeries: 0,
          removedBooks: targets.length,
          files: deleteFiles
            ? [
                {
                  book: "book-1",
                  name: "Volume 1.cbz",
                  outcome:
                    this.outcome === "failed"
                      ? { kind: "failed", reason: "locked" }
                      : { kind: "trashed" },
                },
              ]
            : [],
        };
      },
    };
  }
}
