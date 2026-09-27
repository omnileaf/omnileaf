# Architecture

Omnileaf is a Rust core with a [Tauri 2](https://v2.tauri.app/) shell and a Svelte 5 interface. One codebase builds for Windows, macOS, Linux, Android and iOS. This page describes the shape the code is growing into. Parts that don't exist yet are marked as planned, and each lands in the pull request that first needs it.

## Rules

These hold for every change:

1. **Only the app crate knows about Tauri.** Everything below it is plain Rust that builds and tests without a window.
2. **The webview does no network and no file I/O.** Data comes through typed commands, and bytes (pages, covers) come through the app's own `omni://` protocol. Remote pages are fetched by Rust too, so caching, preloading and "content stays on the device" are handled in one place.
3. **Webview storage is disposable.** Its origin can change between Tauri versions, so durable state lives in SQLite, owned by Rust.
4. **Every change to synced state goes through one write path.** That is what makes sync possible without rewriting the data layer later.
5. **Commands and protocol URLs carry IDs, never file paths.**
6. **Content stays on the user's device.** Any server Omnileaf runs handles data only (progress, library metadata, settings), never pages, images or books.

## Layout

| Path | What it holds | Status |
|---|---|---|
| `xtask/` | Repository automation: `cargo xtask check`, `cargo xtask doctor` | exists |
| `crates/omnileaf-sync-proto` | The pure contract shared with the sync server: IDs and how they are derived, the hybrid logical clock, register and merge types | planned (M1) |
| `crates/omnileaf-core` | Domain types, errors, and the traits the platforms implement (storage, events) | planned (M0) |
| `crates/omnileaf-formats` | Comic archives (CBZ, CB7, CBR) and image folders, natural sort, ComicInfo, safety limits | planned (M1) |
| `crates/omnileaf-imaging` | Decoding, resizing, thumbnails, transcoding for formats a webview can't show | planned (M1) |
| `crates/omnileaf-db` | SQLite: one writer thread, a pool of readers, migrations, queries, the synced-state write path | planned (M1) |
| `crates/omnileaf-cache` | One budgeted on-disk cache for extracted pages, transcodes and thumbnails | planned (M1) |
| `crates/omnileaf-engine` | Services that tie it together: library scanning, pages, the reader, settings, scheduling, and a headless `Core` | planned (M0) |
| `crates/omnileaf-testkit` | Deterministic generated fixtures: images, archives, libraries (development only) | planned (M0) |
| `plugins/tauri-plugin-omnileaf` | Native Kotlin and Swift code: Android folder access, iOS bookmarks, safe areas, immersive reading | planned (M0) |
| `app/` | The Tauri project for all five platforms: the SvelteKit interface and a thin Rust adapter | planned (M0) |

Later milestones add EPUB, remote catalogs (OPDS, Komga, Kavita), downloads, sync (client and a separate server workspace), trackers and an extension host, each as its own crate. Crates are created by the first pull request that gives them real code, never as empty skeletons.

## Seams

These interfaces exist so that later features plug in without rewrites:

- **`Storage`** reads a library root the same way whether it is a plain path, an Android storage-access tree or an iOS security-scoped bookmark.
- **`Container`** is an archive or folder of pages, opened by content sniffing rather than file extension.
- **`Source` and `Content`** describe series, items and pages. The local library is the first implementation, and remote catalogs later implement the same traits.
- **`PageLocator`** says where a page's bytes come from: inside a local archive, from a remote request, or resolved just before fetching. Remote requests are plain data, so a phone's operating system can carry them out in the background.
- **`ResourceRouter`** answers `omni://` requests for pages, thumbnails and (later) EPUB resources, testably without Tauri.

## Runtime

- **Commands** run on Tauri's async runtime.
- **The database** has one writer thread and a small pool of read-only connections.
- **Work is scheduled in lanes:** interactive before prefetch before background, cancellable per reading session. A page turn never waits behind a library scan.
- **A page request** checks the in-memory cache first, then reads the entry from its archive, transcoding only when the webview can't decode the format. The response is marked immutable, and the next pages in reading order are prefetched.

## Data

- **Two kinds of data.** Catalog data is derived from files and stays on the device: series, items, file paths, page dimensions. Synced data is user intent: reading position, read markers, collections, settings.
- **Synced data lives in registers.** Each field carries a hybrid logical clock value, and the rest of the database is rebuilt from the registers. Only the write path changes them.
- **Identity is deterministic.** The same book gets the same ID on every device without coordination. For archives, the ID comes from a fingerprint of every page's checksum and size, read from the archive's own index. So renaming, repacking or editing metadata doesn't change it.
- **Queries paginate by key,** never by offset, so large libraries stay fast.

## Performance budgets

Measured on a 2021 mid-range laptop, a Pixel 6a-class phone and an iPhone 12-class phone.

| Metric | Desktop | Android | iOS |
|---|---|---|---|
| Cold start to library | ≤ 500 ms | ≤ 1.2 s | ≤ 800 ms |
| Preloaded page turn, p95 | ≤ 16 ms | ≤ 33 ms | ≤ 33 ms |
| Open a CBZ to first page | ≤ 150 ms | ≤ 300 ms | ≤ 250 ms |
| Library query, 10k series | ≤ 5 ms | ≤ 15 ms | ≤ 10 ms |
| Scrolling | 60 fps | ≥ 55 fps | 60 fps |

Budgets are enforced by benchmarks and by scripted performance scenarios once the app exists.

## Decisions

Choices that close off an alternative are recorded in [`docs/decisions/`](decisions/).
