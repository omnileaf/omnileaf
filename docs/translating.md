# Translating

Interface text lives in `app/messages/<locale>.json`, one file per language, in the message format the inlang tooling reads. `en.json` is the source. `en-XA.json` is a generated pseudo-locale (`pnpm --dir app run pseudo-locale`) that lengthens and accents every message to expose clipped layouts; do not edit it by hand.

## Message shapes

A plain message is a string. Anything with a number, such as a count, is a list holding one variant: `declarations` name the inputs and how they are formatted, `selectors` pick a plural form, and `match` holds one text per form.

```json
"library_series_books": [{
  "declarations": ["input count", "local countPlural = count: plural", "local formattedCount = count: number"],
  "selectors": ["countPlural"],
  "match": {
    "countPlural=one": "{formattedCount} book",
    "countPlural=other": "{formattedCount} books"
  }
}]
```

A translation keeps the same `declarations` and `selectors` as English and writes the plural forms its language needs (`one`, `few`, `many`, `other`).

## Translating in a translation tool

Most translation tools cannot read that shape. `pnpm --dir app exec node scripts/messages-icu.ts export <locale>` writes a locale as flat ICU MessageFormat strings, the same text with each count written as `{count, number}` and each plural as `{count, plural, one {...} other {...}}`, to `app/target/icu/<locale>.json`. `import <locale>` reads such a file back and rebuilds the message format, taking the declarations and selectors from `en.json`. The converter is covered by a test that takes every English and pseudo-locale message through ICU and back and checks the result is identical.

Run `pnpm --dir app exec prettier --write messages/<locale>.json` after an import to match the repository's formatting.

## Adding a language

1. Add the locale to `locales` in `app/project.inlang/settings.json`.
2. Create `app/messages/<locale>.json` with the translated messages.
3. Run `pnpm --dir app run check` and the interface tests.
