# Changelog fragments

Every change a reader of the app would notice gets one small file in this folder. When a version is released, the files are put together into its release notes and the app's What's new notice.

## When you need one

A pull request needs a fragment when it changes `app/src`, `app/src-tauri/src`, `app/messages`, `crates/*/src` or `crates/*/android`. Tests, docs, CI and dependency updates do not. If a change in those folders is invisible to people, such as a refactor, put the `no-changelog` label on the pull request instead.

## The file

Name it for the change, in lowercase with dashes: `android-section-tabs.md`.

```markdown
---
type: feat
area: library
credit: [octocat]
---
Sections now show as tabs on Android, so you can switch between them with one tap.
```

- `type` is one of `breaking`, `sec`, `feat`, `perf` or `fix`.
- `area` is one of the ids in `config.json`: `library`, `reader`, `series`, `search`, `settings`, `first-launch`, `notices` or `platform`.
- `credit` is optional: the GitHub logins to thank, without the `@`.
- `pr` is optional: the pull request number.
- Below the second `---`, write one or two plain sentences for a reader, in at most 300 characters. Leave out issue numbers and jargon, and do not use em-dashes.

## Commands

- `cargo xtask changes check` checks every fragment.
- `cargo xtask changes require --base origin/main` fails when your branch changes what people see and adds no fragment.
- `cargo xtask changes notes --version 1.2.0 --format markdown` prints the release notes; `--format json` prints what the app's What's new notice bundles.

To add a type or an area, or to change a heading, edit `config.json`.
