# Releasing

Pushing a tag such as `v0.1.0` runs `.github/workflows/release.yml`. It stamps the tag's version into the workspace, builds each platform, and drafts a GitHub release with a `SHA256SUMS` file and notes from the merged pull requests. A tag with a suffix, such as `v0.1.0-rc.1`, drafts a pre-release. Check the draft, then publish it.

Every platform signs only when its secrets are set. Without them the job warns and builds unsigned, or skips what cannot work unsigned, so the workflow stays green for forks and contributors. A test, `app/tests/app/release-workflow.test.ts`, fails if a step after a signing check could run without the check passing.

## What a tag produces

| Platform | Output | Signing |
|---|---|---|
| Linux | `.deb` and `.AppImage` | none |
| macOS | universal `.dmg` | Developer ID signature and notarization |
| Windows | NSIS `-setup.exe` | Authenticode through SignPath |
| Android | `.apk` and a Play `.aab` | upload keystore |
| iOS | build uploaded to TestFlight | distribution certificate and provisioning profile |

An unsigned Android build cannot be installed and iOS has no unsigned distribution, so those two jobs do nothing without their secrets.

## Secrets and variables

Set secrets with `gh secret set NAME` and variables with `gh variable set NAME` on the repository.

### macOS

| Name | Kind | Holds |
|---|---|---|
| `APPLE_CERTIFICATE` | secret | the Developer ID Application certificate and its private key, as a base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | secret | the password the `.p12` was exported with |
| `APPLE_SIGNING_IDENTITY` | secret | the certificate's name, for example `Developer ID Application: Name (TEAMID)` |
| `APPLE_API_ISSUER` | secret | the App Store Connect issuer id |
| `APPLE_API_KEY` | secret | the App Store Connect key id |
| `APPLE_API_KEY_P8` | secret | the contents of the key's `AuthKey_<id>.p8` file |

With the first three the app is signed; with the last three as well it is notarized.

### iOS

| Name | Kind | Holds |
|---|---|---|
| `IOS_DISTRIBUTION_CERTIFICATE` | secret | an Apple Distribution certificate and private key, as a base64 `.p12` |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | secret | its password |
| `IOS_PROVISIONING_PROFILE` | secret | an App Store provisioning profile for `app.omnileaf`, as base64 |
| `APPLE_TEAM_ID` | variable | the ten character team id |
| `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8` | secrets | the same App Store Connect key as for macOS; it uploads the build |

### Android

| Name | Kind | Holds |
|---|---|---|
| `ANDROID_KEYSTORE` | secret | the upload keystore, as base64 |
| `ANDROID_KEYSTORE_PASSWORD` | secret | the keystore password |
| `ANDROID_KEY_ALIAS` | secret | the key's alias |
| `ANDROID_KEY_PASSWORD` | secret | the key's password |

Make the keystore once with `keytool -genkeypair -v -keystore omnileaf-release.jks -alias omnileaf -keyalg RSA -keysize 4096 -validity 10000` and keep it safe. Google Play signs what users install with its own key and checks uploads against this one, so enrol in Play App Signing when creating the app. A local release build reads the same four values from `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

### Windows

| Name | Kind | Holds |
|---|---|---|
| `SIGNPATH_API_TOKEN` | secret | a SignPath API token |
| `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | variables | which SignPath project and policy sign the installer |

SignPath signs open source projects for free after approval.

## Checking the workflow

`pnpm --dir app exec vitest run --project harness` runs the test that every step after a signing check is gated on it.
