# Contributing to Omnileaf

Thanks for your interest in Omnileaf. The project is in early development, so things move quickly. For anything bigger than a small fix, open an issue to discuss it before you start.

## Ground rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Follow the [content policy](docs/legal/content-policy.md). The app ships no content and no content sources, never circumvents DRM, and uses only generated test fixtures. Requests to support specific websites are out of scope.
- Describe the project the way the [wording guide](docs/style/wording.md) sets out.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Contributor License Agreement

Omnileaf is licensed under the [GPL-3.0-only](LICENSE). Contributions are accepted under a [Contributor License Agreement](docs/legal/cla.md) based on the Harmony individual agreement. It lets the project distribute your contribution under the GPL and also under other terms, such as those of app stores whose terms are incompatible with the GPL. You keep the copyright to your work.

The agreement is still being finalised. Until it's in effect, pull requests from outside contributors can't be merged. Issues, bug reports and discussion are very welcome in the meantime.

## How changes land

- **Trunk-based development.** Work on a short-lived branch cut from the latest `main`. Name it for the type of change: `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `test/…`, `perf/…`, `build/…`, `ci/…` or `chore/…`.
- **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** for every commit, for example `fix(reader): keep the page when rotating`. Keep commits small and focused, and make sure each one passes on its own.
- **Small pull requests.** Aim for about 400 changed lines or fewer, not counting generated files. Split bigger work into a series of pull requests that each stand on their own.
- **Review and merge.** Every pull request needs a maintainer's review and green CI, then it is squash-merged into `main`. Nothing lands on `main` directly.

## Checking your work

`cargo xtask check` runs the same checks as CI: formatting, clippy with warnings as errors, and the tests. It needs [cargo-nextest](https://nexte.st/). Rust itself comes from `rust-toolchain.toml`, which rustup picks up automatically.

## Definition of done

A pull request is ready when:

- **It follows the [code standards](docs/code-standards.md)** and was built test-first. New logic comes with tests, new commands with integration tests, and new user-visible flows with end-to-end tests, all in the same pull request. Every bug fix starts with a test that reproduces the bug.
- **CI is green,** with no new warnings.
- **Docs and generated files move with the code.** Where a decision closes off an alternative, it gets a [decision record](docs/decisions/).
- **It leaves nothing unfinished:** no `TODO` or `FIXME` comments, no skipped tests, no lint suppressions without a reason, no commented-out code and no debug output.
- **It contains no copyrighted material,** no real titles and no site-specific code.
