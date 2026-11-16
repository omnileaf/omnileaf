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

- `cargo xtask changes check` checks every fragment and every released archive in `released/`: that its version matches its file name, that it has at least one entry and that its entries and contributors follow the same rules as a fragment.
- `cargo xtask changes require --base origin/main` fails when your branch changes what people see and adds no fragment.
- `cargo xtask changes notes --version 1.2.0 --format markdown` prints the release notes; `--format json` prints what the app's What's new notice bundles, which never holds a login. The Markdown starts with a headline line, the first summary of the `headline` type in `config.json` (`feat`) or, without one, the first entry, since the app's update banner shows the first line. A full release such as 1.2.0 is read from its archive, `released/1.2.0.json`, and fails when there is none; a pre-release such as 1.2.0-rc.1, or no `--version`, is read from the fragments in this folder, and a pre-release fails when there are none.

To add a type or an area, to change a heading or to pick the type that heads the notes, edit `config.json`.
