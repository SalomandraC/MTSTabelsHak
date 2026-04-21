# WikiLive Importer for Obsidian

Community plugin scaffold for importing Markdown notes from an Obsidian vault into WikiLive.

## Features

- API key + `base_url` configuration
- Space loading from WikiLive backend
- Import modes:
  - current note
  - file list
  - folder
  - folder recursively
  - whole vault
- Conflict preview before import

## Local development

```bash
cd obsidian-plugin/wikilive-importer
npm install
npm run dev
```

Then copy this folder into your vault:

```text
<vault>/.obsidian/plugins/wikilive-importer
```

Enable community plugins in Obsidian and turn on `WikiLive Importer`.
