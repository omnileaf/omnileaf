# Contributing to Omnileaf

Thanks for your interest in Omnileaf. The project is in early development, so things move quickly. For anything bigger than a small fix, open an issue to discuss it before you start.

## Ground rules

- Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Follow the [content policy](docs/legal/content-policy.md). The app ships no content and no content sources, never circumvents DRM, and uses only generated test fixtures. Requests to support specific websites are out of scope.
- Describe features technically, never as a way to get content for free.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Contributor License Agreement

Omnileaf is licensed under the [GPL-3.0-only](LICENSE). Contributions are accepted under a [Contributor License Agreement](docs/legal/cla.md) based on the Harmony individual agreement. It lets the project distribute your contribution under the GPL and also under other terms, such as those of app stores whose terms are incompatible with the GPL. You keep the copyright to your work.

You sign it once, on your first pull request: the CLA Assistant check comments with a link, and you agree with your GitHub account. It then covers all your later contributions. A pull request can't be merged until everyone whose commits it holds has signed.

## How changes land

- **Trunk-based development.** Work on a short-lived branch cut from the latest `main`. Name it for the type of change: `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `test/…`, `perf/…`, `build/…`, `ci/…` or `chore/…`.
- **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** for every commit, for example `fix(reader): keep the page when rotating`. Keep commits small and focused, and make sure each one passes on its own.
- **Small pull requests.** Aim for about 400 changed lines or fewer, not counting generated files. Split bigger work into a series of pull requests that each stand on their own.
- **Review and merge.** Every pull request needs a maintainer's review and green CI, then it is squash-merged into `main`. Nothing lands on `main` directly.

## Running the app

Run `cargo xtask doctor` first, since it lists anything missing, including WebKitGTK 4.1 on Linux and the Xcode command line tools on macOS. It also checks the Android and iOS tools, and reports them missing without failing, since only work on phones needs them. Then install the interface dependencies with `pnpm install` and start the app with `pnpm --dir app tauri dev`. The window reloads as you edit the interface. `cargo tauri dev` works too, from the repository root or `app/`, if the `tauri-cli` you installed is the version pinned in `app/package.json`. `pnpm dev` on its own serves the interface without the Rust side, so its commands fail there. The browser tests answer them with a fake backend instead.

To work on the interface without a library of your own, `cargo xtask sample` serves it in a browser against the sample library the design boards are drawn with, Sample Series 01 to 18 with their covers and pages, answered inside the page instead of by the core, and opens it. `cargo xtask sample --platform ios` opens it drawn as that platform; the command runs `VITE_SAMPLE_LIBRARY=on pnpm --dir app dev`. The address picks what it shows, for example `?platform=ios&library=empty`: `platform` takes `android`, `ios`, `macos`, `windows` or `linux`; `library` takes `ready`, `empty`, `loading` or `failed`; `series` takes `ready`, `loading` or `failed`; `volume6` makes Sample Series 04's Volume 6 `present`, `missing` or `damaged`; and `missing` takes a folder that can't be reached, `folder`, `drive`, `access`, `sign-in`, `mount` or `share`, whose Sign in, or Choose it again for `share`, `signin` makes `signedIn`, `cancelled` or `failed`; `launch=first` opens on the first launch, where `home=library` finds a library already in the home folder. It only exists in development: a release build leaves it out even with the variable set, which a browser test checks.

`cargo xtask sample --kit --platform ios` opens the kit page instead, `/kit`, which shows every phone part at once to compare with the design; for it the command also sets `VITE_KIT_PAGE=on`. Add `theme=dark`, `contrast=more` (iOS) or `medium` or `high` (Android), and `transparency=reduced` to the address to see those settings, and view it at phone width, since the phone looks only show below 600 pixels. `pnpm --dir app exec playwright test -c playwright.kit.config.ts` saves its screenshots for iOS and Android, light and dark, to `target/screenshots/kit`. Like the sample library, a release build leaves it out, and it can't open until the first launch has finished.

On Linux, Add a folder opens the desktop's own file chooser through xdg-desktop-portal, so install `xdg-desktop-portal` and the backend for your desktop: `xdg-desktop-portal-gnome`, `xdg-desktop-portal-kde` or `xdg-desktop-portal-gtk`. Without a portal the app falls back to `zenity`, and without either it says what to install and leaves the library unchanged.

`cargo xtask dev` runs the app on the desktop and phones at once, all sharing one dev server: on macOS the desktop app, the iOS Simulator and a connected Android device, and elsewhere the desktop app and Android. Pick platforms with `--platform desktop ios` (or `--platform desktop,ios`), and a simulator or device with `--ios-device` or `--android-device`, by name. `cargo xtask devices` lists the names, including Android emulators that are switched off, which Tauri starts when you pick one, and ends with a ready-to-run `cargo xtask dev` line for each kind of device it finds. Names ignore case, spaces and dashes, so `--ios-device iphone-18-pro-max` finds `iPhone 18 Pro Max`. Naming a device without `--platform` runs only that device's platform, and `cargo xtask dev --help` shows the common invocations. Without a name, `dev` uses the only ready device on each phone platform and otherwise lists them to pick from, and a name that matches several devices, or none, lists the close matches. Outside a terminal it prints the choices and a command to copy instead of asking. An Android emulator reaches the dev server through `adb reverse`, which Tauri sets up, and the iOS Simulator reaches it on `localhost`, so for them the dev server stays on `localhost`. A physical Android phone or iPhone reaches it over your network. When `--android-device` or `--ios-device` names anything other than an emulator or Simulator, or names nothing while a phone is connected, the dev server listens on every network interface and live reload connects to the address Tauri gives the phone. The phone must be on the same network as your computer, and macOS may ask once whether `node` can accept incoming connections. On Windows, Tauri gives Android emulators the network address too, so the dev server listens on the network there.

`cargo xtask dev --fresh` removes the app from the phone, emulator or Simulator first, so it starts with no data, which helps when testing first launch. It clears the one `--android-device` or `--ios-device` names, booting it if needed, or else the only one running. The desktop app keeps your own library and instead starts with a new, empty data folder under `target/dev-data`, which `dev` prints and `cargo clean` removes. That also lets you run an older branch whose database is behind the one your newer branches wrote.

`cargo xtask screenshot` saves what a running phone, emulator or Simulator shows into `target/screenshots`, for pull request images. `--device` picks one when several are running.

### Android

Android builds need:
- JDK 21;
- the Android SDK, in Android Studio's default location or with `ANDROID_HOME` pointing at it;
- the Android NDK version in `.android-ndk-version`, as CI uses. Tauri takes the newest one in the SDK, or the one `NDK_HOME` points at, and `cargo xtask doctor` says when that one differs.

Add the Rust Android targets once with `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`. `pnpm --dir app tauri android dev` runs the app on a connected device or a running emulator. The Android project in `app/src-tauri/gen/android` is committed, and the app supports Android 8.0 (API 26) and later.

### iOS

iOS builds need a Mac with Xcode, selected with `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, and an iOS Simulator runtime. Add the Rust targets once with `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`. `pnpm --dir app tauri ios dev` runs the app in a Simulator or on a connected device. The Xcode project in `app/src-tauri/gen/apple` is committed and generated from its `project.yml` with XcodeGen. The app supports iOS 16 and later.

### App icon

The app icon is drawn in `branding/icon.svg`. `icon-macos.svg` draws the same tile inside the transparent margin macOS expects, so the Dock shows it at the same size as other apps. Android's adaptive icon uses separate layers: `icon-foreground.svg`, which also serves as the monochrome layer for themed icons, over `icon-background.svg`. The drawing appears in `icon.svg`, `icon-macos.svg` and `icon-foreground.svg`, so change all three together. `branding/icon.json` ties the files together and sets the colour that fills the iOS icon's corners.

After changing any of them, run `cargo xtask icons`. It runs Tauri's icon generator, which rewrites the desktop icons in `app/src-tauri/icons` and the ones in the committed Android and Xcode projects. It then builds the macOS icon from `icon-macos.svg` and removes the alpha channel from the iOS icons, because the App Store rejects icons that have one. Tests fail if the macOS icon loses its margin or a committed iOS icon has an alpha channel.

The tray on Linux and Windows shows `branding/tray.svg`, the green square with only the leaf, since the books vanish at tray size. The macOS menu bar shows `branding/tray-macos.svg`, a one-colour leaf that macOS tints like other menu bar items. `cargo xtask icons` draws them into `app/src-tauri/icons/tray.png` and `tray-macos.png`.

## Checking your work

`cargo xtask check` runs the same checks as CI, in groups. `--only <group>` runs one of them: `rust`, `portable`, `interface`, `browser`, `app`, `android` or `ios`. A plain `cargo xtask check` runs every group except `android` and `ios`, which need an emulator or a Simulator. `cargo xtask doctor` lists the tools the groups need and shows how to install any that are missing. Rust itself comes from `rust-toolchain.toml`, which rustup picks up automatically. `--step <name>` and `--skip <name>` narrow a group to the checks named, by the names it prints, and `--partition hash:<k>/<n>` runs one nextest partition of the tests; CI splits the Windows Rust gate across runners this way, and passes `rust gate (windows)` only when every part passes.

CI runs the three macOS gates (`rust gate (macos)`, `app (macos)` and `fixtures (macos)`) on every push to `main` and every night, not on each push to a pull request. GitHub gives a repository five macOS jobs at a time on every plan below Enterprise, so running them on every pull request push would leave other runs waiting. Those three checks show as skipped on a pull request, which still satisfies them, and Linux and Windows run on every push as before. Add the `macos` label to a pull request that changes platform-specific code to run them there before it merges.

### Before you push

Run `cargo xtask install-hooks` once per clone. Git then runs `cargo xtask pre-push` before every push, which checks the branch you have checked out in well under a minute: formatting, the content policy, the sync rules and the comment rules every time, the Rust licences when a `Cargo.toml`, `Cargo.lock` or `about.toml` changed, and the interface build, which checks the JavaScript licences, when a `package.json` or the pnpm lockfile changed. It needs a clean working tree, so it checks exactly what you push, and it names any other branch in the same push that it left unchecked.

The hook catches the drift that most often fails CI, not everything CI checks. Run `cargo xtask check`, or `--only` the groups your change touches, before opening or updating a pull request. In a stack, fix a failure on the lowest branch that has it, then restack the branches above.

### Rust

The `rust` group runs on every platform in CI, because its answer can differ between them:

- clippy over the workspace, with warnings as errors;
- the tests, which also check that the interface's generated command bindings in `app/src/lib/ipc/bindings.ts` are current. After changing a command, regenerate them with `cargo xtask bindings`;
- eleven release-build timing budgets: listing a 500-entry archive takes 3 ms or less, opening a solid 100-page 7z archive of 512 KB pages and reading its first page takes 300 ms or less, a page of the library sorted by title takes 2 ms or less at the 95th percentile over 10,000 series, the first page of a series' books, all of them or only those not marked read and either way round, takes 10 ms or less at the 95th percentile in a series of 10,000 books, a page of the library in either order either way round and through any one filter condition, and a count of the series a filter lets through, each take 2 ms or less at the 95th percentile over 10,000 series, a search of those 10,000 series titles, its first page, the page after it and its count, takes 10 ms or less at the 95th percentile, keying 10,000 series titles again for another language takes 150 ms or less, switching profile over 10,000 series started in both profiles, which rebuilds what the library shows, takes 3 s or less, rescanning an unchanged library of 1,000 books takes 300 ms or less, a cover thumbnail made from a typical full-size colour scan, a JPEG page of about 1 MB with 4:2:0 chroma subsampling, takes 30 ms or less at the 95th percentile, and opening a book never opened before to its first page, a book of 30 such scans whose page sizes around the first page are read on the way and the rest later, takes 150 ms or less at the 95th percentile.

Each timing budget is measured with the testkit's `SpeedTrial`: one untimed warm-up pass, then three timed passes, holding the fastest pass to the budget. A stall on a shared runner only ever adds time, so the fastest pass is the closest to the real cost, and the log shows every pass so a spread between them stays visible. Write a new speed test the same way rather than timing a single pass.

The timing budgets hold exactly on your machine and on CI's Linux runner. The macOS and Windows runners are shared and sometimes stall, so CI sets `OMNILEAF_BUDGET_SLACK=2` there: a timing fails only beyond twice its budget, while the log still shows each measured time against the budget.

The `portable` group holds the Rust checks whose answer is the same everywhere, so CI runs it once, on Linux:

- formatting of the workspace and of the fuzz crate, and clippy over the fuzz crate;
- the WebAssembly build of `omnileaf-sync-proto`;
- `cargo deny`: every third-party crate must be permissively licensed (or MPL-2.0), come from crates.io, and have no open security advisories;
- `cargo xtask policy`, the content policy check below;
- `cargo xtask licences --check`, the licence catalogue check below;
- `cargo xtask lint-sync`, which checks how synced state is written;
- `cargo xtask lint-comments`, which checks the comments in the code.

`cargo xtask lint-sync` keeps synced state behind its one write path:
- only `crates/omnileaf-db/src/store/register.rs` writes `sync_register`, and only `store/local.rs` writes `sync_local`, so no migration writes either, apart from the one that creates `sync_local` with its first row and the one that moves every register into the default profile when registers gained a profile;
- only `store/session.rs` writes `reading_session`, the reading sessions History lists, which will sync too;
- the tables the projector (`store/projector.rs`) writes are projections, which nothing else writes, not even a migration's trigger;
- a projection refers to no other table and holds no unique value, so it can always be rebuilt from the registers.

Integration tests under `tests/` may still seed any table directly.

`cargo xtask lint-comments` reads the comments that start a line in the Rust, TypeScript, JavaScript and Svelte files, leaving generated ones alone, and fails on:
- a `//` comment, unless it is a directive a tool reads, such as `// SAFETY:`, `// eslint-disable-next-line … -- reason` or `// @ts-expect-error`;
- a `/* */` block that isn't a `/** */` doc comment, and an HTML comment in a Svelte file that isn't a licence notice;
- `TODO`, `FIXME`, `XXX` or `HACK`, a comment that only names a test phase, and an issue or ticket number, an ADR or a pointer to `docs/` or `AGENTS.md`;
- a doc comment of more than three lines of prose, not counting blank lines, tags such as `@param`, or the `# Errors`, `# Panics` and `# Safety` headings.
- a doc comment on an item whose words, apart from filler such as "the" or "gets", all appear in the item's own line, like `/// Gets the user by id.` on `fn get_user_by_id`.

ESLint's `no-warning-comments` and `no-inline-comments` rules catch the warning words and comments after code in the editor too.

### Interface

The `interface` group needs Node and pnpm (`pnpm install` first). It runs type checking, ESLint and Prettier, the component tests in Chromium, the unit tests for the app tests' helpers, and a production build.

### Browser tests

The `browser` group runs the built interface in Chromium and WebKit at phone, tablet and desktop sizes, including an accessibility check in the light and dark themes. A spec named `*.desktop.spec.ts`, such as the sweep of desktop window widths, runs only at the desktop size, since a phone or tablet screen doesn't resize like a window. Install the browsers once with `pnpm --dir app exec playwright install chromium webkit`, adding `--with-deps` on Ubuntu or Debian to install the system libraries they need. Playwright's WebKit runs on Windows, macOS, Ubuntu and Debian. On other Linux distributions, run the Chromium tests with `pnpm --dir app test:e2e --project 'chromium-*'` and leave WebKit to CI.

CI builds the app once and splits the suite into two groups, the whole-screen sweeps tagged `@screens` and everything else, sharing each group's tests out across its shards by how long each one took in `app/tests/browser-timings.json`, longest first, so the shards finish at about the same time. A test missing from the file counts as taking the median time. Its `browser tests` check passes once the build and every shard have. After adding or reworking a good many tests, refresh the timings with `pnpm --dir app test:e2e:timings`, which runs the whole suite and rewrites the file. `PLAYWRIGHT_GROUP=screens` or `rest` runs one group, and `PLAYWRIGHT_SHARD=2/10 pnpm --dir app test:e2e` splits the suite locally by Playwright's own count of tests. The tests serve the app on port 4173; to run them in two worktrees at once, give one another port, as in `OMNILEAF_PREVIEW_PORT=4183 pnpm --dir app test:e2e`, keeping clear of 4174, which the kit page and site tests use. To serve a build you have already made with `VITE_SAMPLE_LIBRARY=on VITE_KIT_PAGE=on pnpm --dir app build` instead of building again, set `OMNILEAF_APP_BUILT=on`, as CI's shards do with the one build CI makes for them all.

Once the rest pass, the `speed` project opens the library of 10,000 series nine times in desktop Chromium, with nothing else running, and checks that the median time from the click to the first painted rows is 150 ms or less. `pnpm --dir app test:e2e --project speed --no-deps` runs it on its own. A shard or a group leaves it out, so CI runs it on its own in the first shard of the rest, after that shard's tests.

### App tests

The `app` group builds the app with the `e2e` feature, which adds an embedded WebDriver server and never ships, and drives the real app through it. WebDriver can't reach the system folder picker, so that build answers it with the folder in `OMNILEAF_E2E_PICKED_FOLDER`, which the tests point at a sample library they generate. They also set `OMNILEAF_DATA_DIR`, which every build reads once at startup, so the app keeps its library database in a scratch folder instead of the platform's app data folder, and its cover cache in that folder's `cache` folder instead of the platform's cache folder. It must be an absolute path. The tests open a window, so on Linux without a display run them under `xvfb-run`. They don't run on Windows yet, because the WebDriver plugin doesn't build there with the current Tauri release.

### Android and iOS

The phone tests take the longest, so CI runs them on every push to `main` and every night rather than on each pull request. Add the `mobile` label to a pull request that changes phone-specific code to run them there too.

- `--only android` picks a device: the one `--android-device` names, or else a running emulator, a connected phone, or an emulator it boots and leaves running. It builds the APK for that device's architecture and runs the app tests, except the desktop-only `*.desktop.e2e.ts` and iOS-only `*.ios.e2e.ts` ones, on it through Appium. Install Appium once with `npm install --global appium@3.8.0` and `appium driver install uiautomator2@8.7.0`. Slow Android specs, named `*.android.slow.e2e.ts`, wait out real timers such as the five minutes before a folder's scheduled rescan, so `--only android` leaves them out. Run them afterwards against the same device with `pnpm --dir app test:android:slow`, with `ANDROID_HOME` set to the Android SDK. CI runs them nightly, and on a pull request labelled `mobile` that changes scheduled rescans or can't list its changed files.
- `--only ios` lints the iOS-only Rust for the Simulator, runs the Swift tests of the folder access plugin with `swift test`, then builds the Simulator app and runs them in an iOS Simulator with Appium's XCUITest driver (`appium driver install xcuitest@12.13.2`). It uses the one `--ios-device` names, or else a booted Simulator, or boots an iPhone Simulator and leaves it running. The driver builds its WebDriverAgent with Xcode on the first run. To use Appium's prebuilt one instead, as CI does, download it with `appium driver run xcuitest download-wda -- --outdir <dir> --platform iOS --kind sim` and point `OMNILEAF_PREBUILT_WDA` at the `WebDriverAgentRunner-Runner.app` inside. The tests then install and launch it themselves, trying again if the launch hangs, and have Appium attach to it. The Simulator window can stay open or closed while they run: each test file asks Appium for the window as the selected Xcode's Simulator app (DeviceHub from Xcode 27) has it, so Appium does not restart the Simulator to open or close it. Leave the window as it is while a test file starts its session.

When they fail, `app/test-results` holds the Appium log, and for Android the device log in `logcat.txt`. CI keeps that folder as an artifact of a failed run.

### Coverage

CI measures test coverage and shows it in the `coverage` job's summary. Line coverage of the core crates in `crates/` must not drop below the floor set in `.github/workflows/ci.yml`. When a change raises it, raise the floor in the same pull request.

### Content policy

`cargo xtask policy` checks every file git doesn't ignore against the [content policy](docs/legal/content-policy.md):

- no directories named `sources`, `extensions` or `repos`, and no WebAssembly modules;
- binary files only when listed in `policy/allowed-binaries.txt`;
- links only to hosts in `policy/allowed-hosts.txt`, or to reserved ones such as `example.com` and `*.test`;
- none of the phrases in `policy/forbidden-phrases.txt`.

The last two rules skip the generated licence catalogues in `app/src/lib/licences`, which hold third-party licence texts word for word. Adding an entry to one of those lists is reviewed like any other change.

### Licences

Settings › About › Open-source licences lists every package the app ships, from two generated files in `app/src/lib/licences`. `rust.json` comes from [cargo-about](https://github.com/EmbarkStudios/cargo-about), configured in `about.toml`, for the crates the app depends on across its platforms. `javascript.json` comes from the packages that end up in the interface's bundle. `cargo xtask licences --check` fails when `rust.json` is out of date and the interface build fails when `javascript.json` is, so after changing a dependency run `cargo xtask licences`, which needs `cargo install --locked cargo-about@0.9.2`, and commit both files. Keep the licences `about.toml` accepts in step with the ones `deny.toml` allows.

### Fuzzing

The archive and ComicInfo readers have fuzz targets in `fuzz/`, which sits outside the workspace and builds with the nightly toolchain pinned in `fuzz/rust-toolchain.toml`. Install `cargo-fuzz` once with `cargo install cargo-fuzz@0.13.2 --locked` and write the seed inputs with `cargo xtask fuzz-seeds`. Then, from `fuzz/`, `cargo fuzz list` names the targets and `cargo fuzz run open_book -- -max_total_time=120` fuzzes one for two minutes. A crash leaves its input in `fuzz/artifacts/`; turn it into a regression test in `crates/omnileaf-formats` before fixing it. CI fuzzes every target each night, sharing 15 minutes between them, and keeps any crash inputs as an artifact. The fuzz crate depends on `libfuzzer-sys`, which carries LLVM's NCSA licence; it never ships and sits outside the workspace, so it's left out of the licence rule above.

## Releasing

Pushing a tag such as `v0.1.0` runs `.github/workflows/release.yml`, which builds the Linux packages, a universal macOS disk image, the Windows installer and an Android APK at the tag's version, then drafts a GitHub release with notes from the merged pull requests. A tag with a suffix, such as `v0.1.0-rc.1`, drafts a pre-release. Check the draft, then publish it.

Each platform is signed only when its secrets are set; otherwise the workflow warns and carries on:

- **macOS:** `APPLE_CERTIFICATE` (the Developer ID Application certificate as a base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` sign the app, and `APPLE_API_ISSUER`, `APPLE_API_KEY` and `APPLE_API_KEY_P8` (the App Store Connect key's contents) notarize it.
- **Windows:** the installer goes to SignPath when `SIGNPATH_API_TOKEN` is set, with the repository variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG` and `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`.
- **Android:** `ANDROID_KEYSTORE` (the keystore as base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. An unsigned APK can't be installed, so without them the release has no APK. Make the keystore once with `keytool -genkeypair -v -keystore omnileaf-release.jks -alias omnileaf -keyalg RSA -keysize 4096 -validity 10000` and keep it, and its passwords, somewhere safe: every later update must be signed with the same key. `base64 -i omnileaf-release.jks | pbcopy` copies it for the secret on macOS.

The Android build reads the keystore from `ANDROID_KEYSTORE_PATH`, with `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, so setting those signs a local release build too.

## Definition of done

A pull request is ready when:

- **It follows the [code standards](docs/code-standards.md)** and was built test-first. New logic comes with tests, new commands with integration tests, and new user-visible flows with end-to-end tests, all in the same pull request. Every bug fix starts with a test that reproduces the bug.
- **CI is green,** with no new warnings.
- **Docs and generated files move with the code.**
- **It leaves nothing unfinished:** no `TODO` or `FIXME` comments, no skipped tests, no lint suppressions without a reason, no commented-out code and no debug output.
- **It contains no copyrighted material,** no real titles and no site-specific code.
