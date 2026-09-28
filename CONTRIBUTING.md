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

Run `cargo xtask doctor` first, since it lists anything missing, including WebKitGTK 4.1 on Linux and the Xcode command line tools on macOS. Then install the interface dependencies with `pnpm install` and start the app with `pnpm --dir app tauri dev`. The window reloads as you edit the interface. `cargo tauri dev` works too, from the repository root or `app/`, if the `tauri-cli` you installed is the version pinned in `app/package.json`. `pnpm dev` on its own serves the interface without the Rust side, so its commands fail there. The browser tests answer them with a fake backend instead.

### Android

Android builds need:
- JDK 21;
- the Android SDK, with `ANDROID_HOME` set;
- NDK 27.1.12297006, with `NDK_HOME` pointing at it.

Add the Rust Android targets once with `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`. `pnpm --dir app tauri android dev` runs the app on a connected device or a running emulator. The Android project in `app/src-tauri/gen/android` is committed, and the app supports Android 8.0 (API 26) and later.

### iOS

iOS builds need a Mac with Xcode, selected with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, and an iOS Simulator runtime. Add the Rust targets once with `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`. `pnpm --dir app tauri ios dev` runs the app in a Simulator or on a connected device. The Xcode project in `app/src-tauri/gen/apple` is committed and generated from its `project.yml` with XcodeGen. The app supports iOS 16 and later.

## Checking your work

`cargo xtask check` runs the same checks as CI. For Rust: formatting, clippy with warnings as errors, the tests, and a dependency check. For the interface, which needs Node and pnpm (`pnpm install` first): type checking, ESLint and Prettier, component tests in Chromium, and a production build. The browser tests then run the built interface in Chromium and WebKit at phone, tablet and desktop sizes, including an accessibility check in the light and dark themes. The app tests then build the app with the `e2e` feature, which adds an embedded WebDriver server and never ships, and drive the real app through it. WebDriver can't reach the system folder picker, so that build answers it with the folder in `OMNILEAF_E2E_PICKED_FOLDER`, which the tests point at a sample library they generate. They open a window, so on Linux without a display run them under `xvfb-run`. They don't run on Windows yet, because the WebDriver plugin doesn't build there with the current Tauri release. `--only rust`, `--only interface`, `--only browser` or `--only app` runs one group. `--only android` builds the x86_64 APK and runs the same app tests, except the desktop-only `*.desktop.e2e.ts` ones, on a running emulator or connected device through Appium. Install Appium once with `npm install --global appium@3.8.0` and `appium driver install uiautomator2@8.7.0`. `--only ios` builds the Simulator app and runs them in a booted iOS Simulator, with Appium's XCUITest driver (`appium driver install xcuitest@12.13.2`). The driver builds its WebDriverAgent with Xcode on the first run. To use Appium's prebuilt one instead, as CI does, download it with `appium driver run xcuitest download-wda -- --outdir <dir> --platform iOS --kind sim` and point `OMNILEAF_PREBUILT_WDA` at the `WebDriverAgentRunner-Runner.app` inside. A plain `cargo xtask check` leaves the Android and iOS tests out. CI runs them on pull requests that change the app, the Rust crates, the lockfiles, the toolchain or the workflows, and on every push to `main` and nightly. The Rust tests also check that the interface's generated command bindings, `app/src/lib/ipc/bindings.ts`, are current. After changing a command, regenerate them with `cargo xtask bindings`. Every third-party crate must be permissively licensed (or MPL-2.0), come from crates.io, and have no open security advisories.

The tests use Playwright's browsers. Install them once with `pnpm --dir app exec playwright install chromium webkit`, adding `--with-deps` on Ubuntu or Debian to install the system libraries they need. Playwright's WebKit runs on Windows, macOS, Ubuntu and Debian. On other Linux distributions, run the Chromium browser tests with `pnpm --dir app test:e2e --project 'chromium-*'` and leave WebKit to CI.

CI also measures test coverage and shows it in the `coverage` job's summary. Line coverage of the core crates in `crates/` must not drop below the floor set in `.github/workflows/ci.yml`. When a change raises it, raise the floor in the same pull request.

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
