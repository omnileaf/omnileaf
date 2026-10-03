# Performance baseline

Where the library screen's startup and first paint stood when the grid, compact grid and list views landed. Later changes compare against these numbers, so re-measure them the same way and update this page when a change moves them on purpose.

## Machine

| | |
|---|---|
| Computer | Laptop with an AMD Ryzen 7 8845HS (8 cores, 16 threads) and 32 GB of memory |
| System | Linux, with WebKitGTK 2.52.6 as the app's web view |
| Browser specs | Playwright's Chromium at the desktop size, 1280 × 800 |

## Numbers

| What | Budget | Measured | How |
|---|---|---|---|
| First grid paint of 10,000 series, from the click on Library | 150 ms | median 30 ms (three runs of nine openings: 29.8, 30.1 and 30.1 ms) | `tests/browser/library-first-paint.speed.ts` |
| Scrolling 10,000 series as a grid, compact grid or list | 60 fps on desktop | 60.0 fps in each display, no frame of 300 dropped, in two runs | `tests/browser/library-scroll.speed.ts` |
| Cold start to the library's grid, release build, 3 series | 500 ms on desktop | median 471 ms (431 to 494 ms over nine launches) | Manual, described below |
| Cold start to the page loading, then to its first contentful paint | | medians of 274 ms from launch to the page starting to load, and 128 ms more to its first contentful paint | Manual, described below |
| Scrolling on Android | 55 fps or more | Not measured yet | Needs a phone or an emulator in the loop |

## Measuring

The two browser specs run in the `speed` project, after every other browser spec has finished so their load can't skew a timing:

```sh
cd app
pnpm exec playwright test --project speed
```

Each prints its timings as annotations. The first-paint spec asserts the median of nine openings; the scrolling spec scrolls 40 px a frame for 300 frames and counts a frame as dropped when it took more than one and a half refreshes at 60 Hz, allowing three of them.

The cold start was timed by hand against a release build with the WebDriver feature, `pnpm tauri build --no-bundle --features e2e`. A small script finished the first launch and added the generated sample library once, then launched the app nine times on that data folder. For each launch it noted the time it spawned the process, waited for the WebDriver server, and polled the page every 5 ms until the first series' cover image was in the grid, reading `Date.now()` and the navigation and paint timings from the page. Polling adds a few milliseconds, so the grid times are an upper bound.
