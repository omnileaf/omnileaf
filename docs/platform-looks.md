# Platform looks

Omnileaf draws each platform's own interface from one codebase. A component keeps one set of props, states and events everywhere, so callers never branch on the platform. What changes per platform is how it looks, and, only where the platform draws something with a different structure, which markup it uses. A platform without its own look keeps the app's shared look.

This page covers how the app knows its platform, where platform values come from, and how to give a component a platform's look.

## Knowing the platform

The core reports the platform once at startup. The root layout passes it to `followCorePlatform`, which marks the page with `data-platform` on the root element. `currentPlatform()` reads that mark back, and reads `linux` until the core has reported, so whatever marks the page, the core or a test, agrees with what components read. Some screens still read the platform from the layout's `appInfo`; read it with `currentPlatform()` when you touch them.

You can render any platform in a browser:

- **Development:** with the sample library on, add `?platform=ios` (or `android`, `macos`, `windows`, `linux`) to the address. See the contributing guide.
- **Component tests:** call `followCorePlatform(platform)` before rendering.
- **Browser tests:** `test.use(onPlatform(platform))` swaps the whole fake core for one platform. The `ios-phone` and `android-phone` projects set the `platform` option instead, which changes only the platform the fake core reports. See [Testing](#testing).

Behaviour may depend on the platform (`isPointer`, `usesCommandKey` in `app/src/lib/page/platform.ts`). Looks should not: they come from tokens.

## Tokens

### One source, a file per platform

Every platform value lives in `app/src/lib/theme/tokens.json`:

```json
{
  "name": "button-primary",
  "kind": "color",
  "value": {
    "default": "var(--primary)",
    "ios-light": "#2f6f4f",
    "ios-dark": "#7fcb9d",
    "android-light": "#326a4d",
    "android-dark": "#a4d1b4"
  }
}
```

- `default` is today's value, usually a reference to an existing variable. It applies on every platform without values of its own, so those platforms look exactly as they did before.
- A platform gives either one value (`"ios": "34px"`) or one per theme (`ios-light` and `ios-dark`), never both.
- `reducedMotion` on a duration sets the value used when the system asks for reduced motion.
- A colour can carry values for the system's accessibility settings, under keys shaped `<platform>-light-<mode>` and `<platform>-dark-<mode>`. Each setting belongs to one platform: iOS has `contrast-more` (Increase Contrast, drawn under `data-contrast="more"`) and `transparency-reduced` (Reduce Transparency, drawn under `data-transparency="reduced"`), and Android has `contrast-medium` and `contrast-high` (Colour contrast, drawn under `data-contrast="medium"` and `"high"`). A setting needs both its light and its dark key, and the platform must have a value of its own, which applies whenever the setting is off. A token with `reducedMotion` cannot also change under a setting, since the setting would outrank reduced motion. Reduced transparency wins when both are on. `followDisplayModes` in `app/src/lib/page/display-modes.ts` sets the attributes, and the sample library reads `?contrast=` and `?transparency=` from its address.

`pnpm --dir app tokens` writes `app/src/lib/theme/generated/`: the defaults, one file per platform, and an index that `app.css` imports. Commit the generated files. Two tests guard them: one fails when a token lacks a platform that another token has, and one fails when the committed files differ from what the source generates.

### Names

Each token becomes a variable named `--native-<kind>-<name>` and a Tailwind utility under its kind:

| Kind | Utility example |
|---|---|
| `color` | `bg-native-button-primary`, `text-native-on-button-primary` |
| `radius` | `rounded-native-button` |
| `spacing` | `min-block-native-button`, `px-native-button-inline` |
| `text` | `text-native-button` |
| `leading` | `leading-native-button` |
| `weight` | `font-native-button` |
| `tracking` | `tracking-native-button` |
| `duration` | `duration-move` |
| `ease` | `ease-glass` |

Durations and eases keep the app's existing motion names, so every `duration-*` and `ease-*` class already in use follows the platform. Under reduced motion, `move` and `slide` drop to no movement at all, wherever they are used.

When you add a utility name to `tokens.json`, add it to `TOKEN_THEME` in `app/src/lib/components/cn.ts` as well, so the class merge treats it as the size or spacing it is. A test fails until you do.

### Adding a platform's tokens

1. For every token in `tokens.json`, add the platform's value: `"macos": …`, or `"macos-light"` and `"macos-dark"` for colours.
2. Run `pnpm --dir app tokens`. A new platform file appears in `generated/`, and the index imports it.
3. Run the component tests. The completeness test names any token still missing the platform.

Add a token when the first component that reads it lands, with a `default` that keeps today's look.

## A component's platform look

### Same structure, different look

Most components draw the same markup everywhere. Keep one class string built from native tokens, and let the token values differ per platform. The Button in `app/src/lib/components/ui/button/looks.ts` shows the pattern:

- A table says which platforms draw their own look: `HAS_NATIVE_LOOK satisfies Record<Platform, boolean>`. Adding a platform to the app makes it a type error until the table says yes or no.
- The native class strings use only `native-` utilities, so iOS and Android differ only in token values.
- Anything without a native look returns today's classes. Platforms whose turn hasn't come yet, and looks whose layout belongs to another component, keep working unchanged.

Set geometry and colour through tokens. Don't use platform variants (`ios:`, `android:`) in a component's look.

### Different structure

Where a platform draws a different structure, for example a bottom sheet against a centred dialog, the component picks its implementation inside itself, keyed by platform:

```svelte
<script lang="ts">
  import type { Component } from "svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import type { SheetProps } from "./contract.ts";
  import SheetAndroid from "./sheet-android.svelte";
  import SheetIos from "./sheet-ios.svelte";
  import SheetShared from "./sheet-shared.svelte";

  const IMPLEMENTATIONS = {
    android: SheetAndroid,
    ios: SheetIos,
    linux: SheetShared,
    macos: SheetShared,
    windows: SheetShared,
  } satisfies Record<Platform, Component<SheetProps>>;

  let props: SheetProps = $props();

  const Implementation = IMPLEMENTATIONS[currentPlatform()];
</script>

<Implementation {...props} />
```

- Every implementation takes the same props type, kept in `contract.ts`.
- Behaviour, focus and keyboard handling come from the same Bits UI primitive in every implementation.
- Share one file between platforms that draw the same thing. Never copy a file to start a second platform.

## Icons

`Icon` (`app/src/lib/components/ui/icon/`) takes a shared name and draws it as a mask in the current text colour: Framework7 Icons on iOS, Material Symbols on Android, Lucide everywhere else. `filled` swaps in the filled artwork where a platform has one.

To add an icon:

1. Add its name to `app/src/lib/icons/icon-map.json`, with its Lucide, Material Symbols and, where one exists, Framework7 names.
2. Run `pnpm --dir app icons`. It fetches the pinned packages named in `PORTED_CODE`, copies the artwork the map needs, and writes `icons.css` and the `IconName` type.
3. Commit the artwork, the generated files and the map together. A test fails when the artwork on disk doesn't match the map.

## Testing

- **Component tests:** loop over all five platforms with `followCorePlatform`, and check that the accessible name, role and behaviour stay the same everywhere. Then check each platform's look by computed size and colour. `app/src/lib/components/ui/button/native-button.test.ts` is an example.
- **Browser specs:** tag a spec `@native` once its screen has a native look:

  ```ts
  test.describe("a dialog's buttons", { tag: "@native" }, () => {
    test("…", async ({ page, platform }) => { … });
  });
  ```

  Tagged specs also run in the `ios-phone` (WebKit) and `android-phone` (Chromium) projects, with `platform` set. Every spec runs in the default projects as before. Use the `platform` fixture to tell which look a run expects, and run `accessibilityViolations` with the native look on screen. In those two projects the project's platform replaces any platform a spec sets with `onPlatform()`, so a tagged spec leaves the platform to the project.
