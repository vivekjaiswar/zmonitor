# Translations

Each language lives in its own JSON file in this directory (e.g. `en.json`,
`fr-FR.json`). Keys are shared across all files — add or edit the `value` for
your language's key, leaving the key itself unchanged.

## Adding a new language

1. Copy `en.json` to a new file named after the language code (e.g. `de-DE.json`).
2. Translate the values.
3. Add the language to `languageList` in `src/i18n.js`, format: `"de-DE": "Deutsch",`.
