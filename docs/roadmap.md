# Roadmap

Omnileaf is built one milestone at a time, each solid before the next. This is the current plan, and it changes as the project learns.

| Milestone | What it delivers |
|---|---|
| **M0: Foundation** | Workspace, CI on all five platforms, the app shell, typed commands, the `omni://` protocol, generated fixtures, end-to-end tests on every platform, performance baselines, nightly builds |
| **M1: Local comics** | CBZ, CBR, CB7 and image folders; a library with covers, search and sorting; a paged reader (left-to-right, right-to-left, spreads, zoom) and a vertical scroll reader; saved progress. The first release, 0.1. |
| **M2: EPUB** | Reflowable and fixed-layout EPUB, with themes, fonts and positions that survive re-flowing. Protected books are refused. |
| **M3: Catalogs and servers** | Komga, OPDS 1.2 and 2.0 (including page streaming), and Kavita: browse, search, stream with preloading, download whole books, and sync reading progress with the server |
| **M4: Sync** | Progress, library and settings synced across devices through an Omnileaf sync server. There is a hosted instance and a self-hostable one, with end-to-end encryption. Folder and WebDAV sync come afterwards. |
| **M5: Downloads** | A download queue that survives restarts, background downloads on Android and iOS, keeping the next chapters ready offline, storage limits |
| **M6: Trackers** | Reading progress sent to tracking services such as AniList and MyAnimeList |
| **M7: Extensions** | A sandboxed WebAssembly host for sources that users add themselves. The app ships with no extensions and no extension repositories. |

## M0 in detail

1. Licence, policies and contributor docs *(done)*
2. Architecture, roadmap and design docs
3. Cargo workspace and the local gate *(done)*, plus `cargo xtask doctor` *(done)*
4. CI gates: dependency licences, policy checks, coverage, and tests on Linux, macOS and Windows
5. The app shell: Tauri and SvelteKit, with browser tests
6. Typed commands and events, and a headless core
7. The `omni://` protocol
8. End-to-end tests on the three desktops
9. Android build and end-to-end tests
10. iOS build and end-to-end tests
11. Native plugin and a storage spike (Android folder access, iOS bookmarks)
12. Generated fixtures, and seeding them for end-to-end tests
13. Performance baselines
14. Nightly builds
