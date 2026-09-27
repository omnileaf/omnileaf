# 0002: Workspace and crate boundaries

- Status: Accepted
- Date: 2026-09-27

## Context

One codebase has to serve five platforms, stay fast to build and test, and take on EPUB, remote catalogs, downloads, sync and extensions later without a rewrite. Tauri ties code to a window and a webview, which makes it slow to test.

## Decision

- **One Cargo workspace** with shared dependency versions and one lint policy.
- **Logic lives in plain library crates** (`crates/omnileaf-*`) that never depend on Tauri. The Tauri crate in `app/` is a thin adapter over them.
- **Crates split along responsibilities that change for different reasons:** formats, imaging, database, cache, engine, and the pure sync contract.
- **Pure crates build for `wasm32-unknown-unknown`** (identity, domain types, the sync contract). This proves they carry no I/O, and it lets the sync server share them without pulling in anything that handles content.
- **A crate is created by the first pull request that gives it real code.**
- **Repository automation lives in `xtask`,** run through `cargo xtask`, so it needs nothing beyond Rust.

## Consequences

- Most behaviour is tested as plain Rust, without a window.
- Adding a feature means adding a crate or a module behind an existing seam, rather than reshaping the app.
- Crate boundaries must be kept deliberate: a new dependency between crates is a design decision, not a convenience.

## Alternatives considered

- **One large crate:** slower incremental builds, and nothing stops the interface layer reaching into storage.
- **Every planned crate created up front:** empty layers with no callers, which the code standards rule out.
- **Logic inside the Tauri crate:** untestable without a window, and tied to one framework version.
- **Shell scripts or `just` for automation:** an extra tool to install on every machine, and scripts that behave differently on Windows.
