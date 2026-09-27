# Code standards

The bar for every change in this repository. When trade-offs conflict, they resolve in this order: correctness, then long-term maintainability, then speed of delivery. Whatever merges becomes the pattern the next change copies.

## Design

- **Use the domain's words everywhere.** A series, an item and a page are called that in the code, the schema, the IPC types and the docs alike.
- **No `Manager`, `Helper`, `Util` or `Data` names.** A type that seems to need one is doing too much.
- **One job per function.** Keep each function at one level of abstraction, and prefer early returns to nesting.
- **Keep signatures small.** Three parameters at most, and no boolean flags. Values that travel together become a type.
- **One concept per file,** and one way to do each thing. Follow the pattern already next to your change. Replacing a pattern is its own refactor, applied to every use.
- **Pure core, I/O at the edges.**
  - Domain crates take and return data. They never import Tauri, a transport or a driver.
  - The clock, randomness, paths and clients are injected, never global.
- **No speculative abstraction.** No trait with one implementation and no planned second. The exception is a seam the architecture already names.
- **Illegal states are unrepresentable.** Use sum types matched exhaustively, not flags with optional fields that must agree.
- **Newtype identifiers.** A `SeriesId` can never be passed where an `ItemId` is expected.
- **Parse at the boundary, once.** Past it, there are no unchecked casts.
- **No magic numbers or strings.** Name them.

## Errors

- **Never swallow an error.** Catch only what you can handle, and keep the cause.
- **Expected failures are part of the contract.** Libraries return typed errors the caller can match. Panics are for bugs only.
- **Absence is explicit.** Use `Option` or `undefined`, handled where it is read. No sentinel values.
- **Error messages say what was attempted and on what,** for example `open archive 42: unsupported compression method`.
- **Errors that cross IPC** carry a stable machine-readable `code` and a safe message. Details go to the log only.

## Comments

No comments by default. Code that needs a comment to be understood isn't finished yet, so fix the code instead: rename, extract a function, or introduce a type or a named constant.

- **No inline comments.**
- **Doc comments** only when names and types can't carry the point: a non-obvious why, an invariant, a workaround, or a contract such as units, ordering or side effects. One sentence by default, and three lines of prose at most. Anything longer belongs in `docs/`.
- **Module docs** are one line at most.
- **Never in code:** references to documentation files, ticket numbers, history notes, `TODO` or `FIXME`, commented-out code, or section banners.
- **Exempt:** lint suppressions with a reason, `// SAFETY:` above every `unsafe` block, `@ts-expect-error` with a reason, and build or codegen directives.

## Testing

Test-driven by default. A change with behaviour starts with a failing test.

1. **Red.** Write one test for one behaviour, and confirm it fails for the expected reason: on the assertion or inside a stub, never on a compile error. Land the signature with a stub body first (`todo!()` in Rust, `throw new Error("not implemented")` in TypeScript, `TODO()` in Kotlin), then write the test.
2. **Green.** Write the minimum code that passes.
3. **Refactor.** Improve the structure with every test green.

- **Bug fixes start with a test that reproduces the bug.** Then fix the root cause, and look for the same mistake elsewhere.
- **Tests drive public seams** (exported functions, commands, the UI), never private helpers.
- **Name tests for the behaviour they prove,** for example `rejects an archive with a path outside its root`.
- **Structure each test as arrange, act, assert,** separated by blank lines. Assert an outcome that would change if the behaviour broke.
- **Keep tests deterministic:**
  - no real network (fixtures served by a local fake);
  - a fixed clock and seed;
  - no sleeps and no shared state;
  - wait on the app's idle signal instead of time.
- **Use fakes at I/O boundaries** rather than mocks of our own modules.
- **Property tests** cover invariants such as round trips, parsers and ordering. Mutation testing checks that assertions catch regressions.
- **A flaky test is a bug.** Fix it, or quarantine it with a tracked issue. Never retry until green.
- **Never weaken a test to get green.** No skipping, deleting, loosening an assertion or raising a timeout.
- **Fixtures are generated.** Never real books, comics or titles (see the [content policy](legal/content-policy.md)).

## Rust

- **Workspace-wide settings:** versions in `[workspace.dependencies]` and lints in `[workspace.lints]`. Clippy `all` and `pedantic` run with warnings as errors.
- **Silence a lint** with `#[expect(lint, reason = "…")]`, never a bare `#[allow]`.
- **`unsafe_code = "forbid"`,** except in crates that exist for FFI. There, every `unsafe` block has a `// SAFETY:` line explaining why it holds.
- **No `unwrap`, `expect`, `panic!` or `todo!`** outside tests.
  - Use `.get()` over indexing when the index isn't proven in bounds.
  - Use `try_from` over narrowing `as` casts.
  - Use `checked_`, `saturating_` or `wrapping_` arithmetic on untrusted input.
- **Error types:** libraries return `thiserror` enums. `anyhow` appears only in binaries (`xtask`, the app's entry point).
- **Error chains:** keep them with `#[from]` or `#[source]`, and don't repeat the source in the message.
- **Async runtime:** `tokio` throughout. Blocking work (file I/O, SQLite, archive parsing) runs on the database thread or through `spawn_blocking`.
  - Never hold a `std::sync::Mutex` guard across `.await`.
  - Bound fan-out with a semaphore or `buffer_unordered`.
  - Keep every `JoinHandle`.
  - Measure elapsed time with `Instant`.
- **Traits:** use native `async fn`. `async-trait` only where `dyn` is required.
- **Logging:** `tracing` only. `#[tracing::instrument(skip_all, fields(...))]` on functions that do I/O.
- **Visibility and determinism:** private by default, `pub(crate)` before `pub`. Use `BTreeMap` or an explicit sort wherever output must be deterministic.
- **Secrets:** types holding secrets get a hand-written `Debug` that redacts them.
- **Tauri commands** are thin adapters over the engine. They return `Result<T, IpcError>` and get the narrowest capability set that works.
- **Pure crates** carry no I/O and must build for `wasm32-unknown-unknown`. These are the crates shared with the sync server or used for identity and domain types.
- **Test layout:** unit tests go in a `#[cfg(test)] mod tests` block at the foot of the file, and integration tests in `tests/` through the public API.
  - Use `proptest` for invariants, `rstest` for tables of cases, and `insta` for structured output.
  - Assert the variant, not the message.
- **Builds use `--locked`,** and `Cargo.lock` is committed.

## TypeScript and Svelte

- **Strict compiler settings:** `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns` and `verbatimModuleSyntax`.
- **No unchecked escapes:** no `as` casts other than `as const`, no `!` non-null assertions, no `@ts-ignore`, and no `any`.
- **IPC types:**
  - They come from the generated bindings, never hand-written copies.
  - IDs are branded types, created only by the IPC client.
  - Times cross IPC as RFC 3339 UTC strings.
- **State modelling:** discriminated unions on a literal `kind` field, with switches ending in `assertNever`.
- **Enums:** use string-literal unions, not `enum`.
- **Exports:** named exports only (unless SvelteKit requires a default), with explicit return types on exported functions.
- **Modules:** no work at import time, and no import cycles.
- **Promises:** no floating promises. `Promise.all` only over bounded lists.
- **Svelte state:** runes (`$state`, `$derived`, `$effect`) in `.svelte.ts` classes, with no store library. Components below the route level take props and callbacks.
- **Tests:** vitest doesn't type-check, so `svelte-check` runs alongside it. Time comes from fake timers, and `TZ` is pinned to UTC in test scripts.
- **Tools:** run them through `pnpm` scripts, never `npx`.

## Kotlin (Android plugin)

- **Immutability:** `val` over `var`, and read-only collections exposed.
- **Nulls:** no `!!`. Use `requireNotNull(x) { "…" }` at the boundary.
- **Type modelling:** closed sets are `sealed interface`s, matched with an exhaustive `when` that has no `else`. IDs and URIs are `@JvmInline value class`es.
- **Failures:** failures the caller must handle are sealed result types. No `runCatching` in domain code. A boundary `catch` rethrows `CancellationException`.
- **Coroutines:** every coroutine has an owner scope. The dispatcher is injected, never `Dispatchers.IO` inline. Suspend functions are main-safe.
- **Tooling:** ktlint (through Spotless), detekt and Android lint, with `allWarningsAsErrors`. Versions live in `libs.versions.toml`.

## Swift (iOS plugin)

- **Concurrency:** Swift 6 strict concurrency checking.
- **Safety:** no force unwraps and no `try!`.
- **Types:** closed sets are enums, switched exhaustively without `default`.
- **Logging and tooling:** `os.Logger` for logging, SwiftLint and swift-format for style, and XCTest for tests.

## Data and IPC

- **Transactions:** a write that spans rows or tables runs in one short transaction.
- **Constraints:** invariants live in the schema (`NOT NULL`, checks, unique constraints) and are enforced by the database, not by check-then-act code.
- **Queries:** list columns explicitly, with no `SELECT *`. Hot queries have an `EXPLAIN` test proving they use an index.
- **Migrations** only move forward and are named for what they do, for example `0001_create_catalog.sql`. Never edit an applied migration.
- **Pagination:** every list command paginates with an opaque cursor from the start.
- **Versioning:** contracts that are expensive to change are versioned from day one, and changes within a version are additive only. That covers the database schema, IPC types, protocol URLs and sync messages.
- **Config** is parsed once at startup into one typed value. Nothing else reads the environment.

## Security

- **Paths:** commands and protocol URLs take IDs, never paths.
- **Archives:** extraction checks every entry path and enforces size, count and ratio limits.
- **XML:** parsed with external entities and DTDs disabled, and with size limits.
- **Untrusted input** is parsed into validated types, never into shell commands, SQL or paths. Queries use parameters.
- **Secrets** stay out of code, logs, errors and fixtures.
- **Outbound calls** have timeouts, and retries are idempotent with capped backoff and jitter.

## Dependencies

New dependencies are rare. Before adding one, check:
- recent releases and responsive maintenance;
- a licence on the allowlist, which is permissive only, because third-party copyleft code is not accepted;
- a size and transitive tree in proportion to what it does;
- the expected publisher;
- what its build or install scripts run.

Say why in the pull request. Upgrades happen on purpose, in their own commit.

## Performance

Measure before optimising. Put benchmark or profile numbers in the pull request. Anything that runs over unbounded input has a known complexity, and hot paths have benchmarks.

## UI

- **Styling uses Tailwind utilities built only from our design tokens** in `app/src/app.css`: `bg-surface`, `text-muted`, `p-lg`, `rounded-control` and so on.
  - Tailwind's default palette and scales are removed, and arbitrary values such as `p-[13px]` fail lint. A value that's missing becomes a new token, reviewed like any other change.
  - Use logical directions (`ms-`, `me-`, `mbs-`) rather than left, right, top and bottom, so layouts follow the reading direction.
  - Prettier sorts classes.
- **Themes and platforms override token variables** (dark mode today, platform and user themes later), never individual components.
- **Widgets:** native elements first (`button`, `dialog`, the `popover` attribute, range inputs). Menus, selects, comboboxes, tooltips, tabs and sliders use Bits UI, styled with our tokens.
- **Semantics:** native elements first (`button` for actions, `a` for navigation). ARIA only when no element fits.
- **Keyboard and focus:** everything works from the keyboard. Focus moves on route changes, and dialogs trap focus.
- **Contrast and motion:** WCAG AA contrast, text that scales to 200%, respect for `prefers-reduced-motion`, and touch targets of at least 44 pt on iOS and 48 dp on Android.
- **Strings:** every user-facing string lives in the translation catalogue, as whole sentences with placeholders, using the plural API for counts.
- **Formatting and layout:** dates and numbers are formatted with `Intl`. Layouts use logical CSS properties, so right-to-left interface languages work, independently of a book's reading direction.
