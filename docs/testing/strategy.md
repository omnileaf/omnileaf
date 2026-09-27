# Testing strategy

Every change is built test-first (see the [code standards](../code-standards.md)). Tests are layered so that most behaviour is proven by fast tests, and the slow end-to-end tests cover real user flows on real platforms.

| Layer | Tools | What it covers | When it runs |
|---|---|---|---|
| Unit and property | nextest, proptest, cargo-fuzz | Pure logic: sorting, IDs, fingerprints, merge rules, parsers | Every pull request; fuzzing nightly |
| Engine integration | Rust tests driving the headless core through the same commands the interface calls | Scanning, opening, reading, progress: every command, end to end, without a window | Every pull request |
| Interface unit | vitest and Testing Library, with a typed fake backend | Components, state, reader layout, gestures | Every pull request |
| Browser end-to-end | Playwright in Chromium and WebKit, with the typed fake backend, on phone, tablet and desktop sizes | Interface flows, scrolling, reader gestures, accessibility checks, visual snapshots | Every pull request |
| App end-to-end | The real app on the real platforms: WebdriverIO on Windows, macOS and Linux; Appium on Android and iOS; one shared suite of specs | Real user flows on all five platforms | Linux on every pull request; the rest on pull requests that touch the app, and nightly |
| Performance | Scripted scenarios in the real app | The budgets in the architecture | Nightly and before each release |
| Manual checklist | A short release checklist | Only what automation can't reach reliably, such as real SD cards and cloud storage providers | Before each release |

## Rules

- **The fake backend is typed against the generated command bindings,** so interface tests can't drift from the Rust side.
- **Test hooks never ship.** The end-to-end driver, the state reset and the idle probe are compiled in only behind an `e2e` feature, and CI checks that release builds don't contain them.
- **No sleeps.** End-to-end specs wait on the app's idle signal: no pending commands, image loads or background jobs. They select elements by `data-testid`, and reset state between specs.
- **Flaky tests are bugs.** A test that passes only on retry fails the job until it is fixed.
- **Fixtures are generated** by the project's own tools from a fixed seed: images, archives and whole libraries with neutral names such as "Sample Series 03". The few fixtures that can't be generated in CI are committed with a record of how they were made.
- **Coverage** is reported on every pull request, and core crates may not drop below their current coverage.

## What each change needs

- New logic gets unit tests.
- A new command gets an engine integration test.
- A new user-visible flow gets a browser spec and an app spec in the same pull request.
- A bug fix starts with a test that reproduces it.
