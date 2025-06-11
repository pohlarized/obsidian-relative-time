# RFC 3339 Relative Time

This is a simple plugin that displays RFC 3339 timestamps within inline codeblocks as relative timestamps.

## Usage

All [RFC3339](https://www.rfc-editor.org/rfc/rfc3339) compliant ["full-date"](https://www.rfc-editor.org/rfc/rfc3339#section-5.6) and ["date-time"](https://www.rfc-editor.org/rfc/rfc3339#section-5.6) timestamps that are contained within *inline* codeblocks will be displayed as a local time string (leveraging JavaScript's `Date.toLocaleString()` and `Date.toLocaleDateString()` methods), as well as a relative time (leveraging `@github/relative-time-element`s `relative` format with a `threshold` of `P100Y`, so we want a relative time unless the date is more than 100 years away).

### Examples:

- `2023-01-01` becomes `Jan 1, 2023 (3 years ago)`
- `2023-01-01T10:00:00+01:00` becomes `Jan 1, 2023, 10:00 (3 years ago)`
- `2025-06-01T10:00:00+02:00` becomes `Jun 1, 2025, 10:00 (last week)`


## Development

- `npm run build` to build the newest release

### Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Acknowledgements

This plugin is generated from the [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin).
It leverages [`@github/relative-time-element`](https://www.npmjs.com/package/@github/relative-time-element) for formatting datetimes.
The plugin was mostly vibe-coded with some minor manual fixes using google gemini 2.5 pro preview.
