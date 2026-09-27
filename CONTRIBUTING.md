# Contributing to Omnileaf

Thanks for your interest in Omnileaf. The project is in early development, so things move quickly. For anything bigger than a small fix, open an issue to discuss it before you start.

## Ground rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Follow the [content policy](docs/legal/content-policy.md). The app ships no content and no content sources, never circumvents DRM, and uses only generated test fixtures. Requests to support specific websites are out of scope.
- Describe features technically, never as a way to get content for free.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Contributor License Agreement

Omnileaf is licensed under the [GPL-3.0-only](LICENSE). Contributions are accepted under a [Contributor License Agreement](docs/legal/cla.md) based on the Harmony individual agreement. It lets the project distribute your contribution under the GPL and also under other terms, such as those of app stores whose terms are incompatible with the GPL. You keep the copyright to your work.

The agreement is still being finalised. Until it's in effect, pull requests from outside contributors can't be merged. Issues, bug reports and discussion are very welcome in the meantime.

## How changes land

- **Trunk-based development.** Work on a short-lived branch cut from the latest `main`. Name it for the type of change: `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `test/…`, `perf/…`, `build/…`, `ci/…` or `chore/…`.
- **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** for every commit, for example `fix(reader): keep the page when rotating`. Keep commits small and focused, and make sure each one passes on its own.
- **Small pull requests.** Aim for about 400 changed lines or fewer, not counting generated files. Split bigger work into a series of pull requests that each stand on their own.
- **Review and merge.** Every pull request needs a maintainer's review and green CI, then it is squash-merged into `main`. Nothing lands on `main` directly.

## Running the app

Run `cargo xtask doctor` first, since it lists anything missing, including WebKitGTK 4.1 on Linux and the Xcode command line tools on macOS. Then install the interface dependencies with `pnpm install` and start the app with `pnpm --dir app tauri dev`. The window reloads as you edit the interface. `cargo tauri dev` works too, from the repository root or `app/`, if the `tauri-cli` you installed is the version pinned in `app/package.json`. `pnpm dev` serves just the interface, for a browser.

## Checking your work

`cargo xtask check` runs the same checks as CI. For Rust: formatting, clippy with warnings as errors, the tests, and a dependency check. For the interface, which needs Node and pnpm (`pnpm install` first): type checking, ESLint and Prettier, component tests in Chromium, and a production build. The browser tests then run the built interface in Chromium and WebKit at phone, tablet and desktop sizes, including an accessibility check in the light and dark themes. `--only rust`, `--only interface` or `--only browser` runs one group. Every third-party crate must be permissively licensed (or MPL-2.0), come from crates.io, and have no open security advisories.

The tests use Playwright's browsers. Install them once with `pnpm --dir app exec playwright install chromium webkit`, adding `--with-deps` on Ubuntu or Debian to install the system libraries they need. Playwright's WebKit runs on Windows, macOS, Ubuntu and Debian. On other Linux distributions, run the Chromium browser tests with `pnpm --dir app test:e2e --project 'chromium-*'` and leave WebKit to CI.

The gate also runs `cargo xtask policy`, which checks every file git doesn't ignore against the [content policy](docs/legal/content-policy.md):
- no directories named `sources`, `extensions` or `repos`, and no WebAssembly modules;
- binary files only when listed in `policy/allowed-binaries.txt`;
- links only to hosts in `policy/allowed-hosts.txt`, or to reserved ones such as `example.com` and `*.test`;
- none of the phrases in `policy/forbidden-phrases.txt`.

Adding an entry to one of those lists is reviewed like any other change. Rust itself comes from `rust-toolchain.toml`, which rustup picks up automatically.

`cargo xtask doctor` lists the tools the repository needs, and shows how to install any that are missing.

## Definition of done

A pull request is ready when:

- **It follows the [code standards](docs/code-standards.md)** and was built test-first. New logic comes with tests, new commands with integration tests, and new user-visible flows with end-to-end tests, all in the same pull request. Every bug fix starts with a test that reproduces the bug.
- **CI is green,** with no new warnings.
- **Docs and generated files move with the code.**
- **It leaves nothing unfinished:** no `TODO` or `FIXME` comments, no skipped tests, no lint suppressions without a reason, no commented-out code and no debug output.
- **It contains no copyrighted material,** no real titles and no site-specific code.
