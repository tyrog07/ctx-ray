<p align="center">
  <img src="https://img.shields.io/badge/ctx--ray-v2.0.0-cyan?style=for-the-badge" alt="ctx-ray" />
  <img src="https://img.shields.io/badge/AI--Ready-XML%20First-blueviolet?style=for-the-badge" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />
</p>

<h1 align="center">ctx-ray ✦ Surgical AI Context Bundler</h1>

<p align="center">
  Stop copy-pasting files into ChatGPT. Bundle <em>exactly</em> what the AI needs — nothing more.
</p>

---

## Why ctx-ray?

Most tools dump your entire codebase and hope the AI figures it out. `ctx-ray` is **surgical** — it traces your import graph and packs only the files that actually matter for your task, wrapped in structured XML that modern LLMs (Claude, Gemini, GPT-4) navigate far better than raw Markdown dumps.

| Feature | ctx-ray | repomix / codefetch |
|---|---|---|
| Import-graph tracing | ✅ Surgical mode | ❌ Always dumps everything |
| XML-first output | ✅ With CDATA + metadata | ❌ Markdown only |
| `.aiignore` support | ✅ | ❌ |
| Token budget warnings | ✅ | ❌ |
| `--diff` / `--since` | ✅ | ❌ |
| Clipboard-only mode | ✅ | ❌ |
| Minified file detection | ✅ Auto-skipped | ❌ |
| Per-file complexity | ✅ H/M/L rating | ❌ |

---

## Installation

```bash
npm install -g ctx-ray
# or use directly without installing
npx ctx-ray init
```

---

## Quick Start

```bash
# 1. Initialise in your project (creates .ctx-ray.json, .aiignore, updates .gitignore)
ctx-ray init

# 2. Bundle the entire project
ctx-ray pack

# 3. SURGICAL MODE — trace imports from a single entry file
ctx-ray pack ./src/components/UserDashboard.tsx

# 4. Only files changed since your last commit
ctx-ray pack --diff

# 5. Only files changed in the last hour
ctx-ray pack --since "1 hour ago"

# 6. Embed custom instructions directly into the XML
ctx-ray pack --prompt "Review this code for security vulnerabilities"

# 7. Watch for file changes and auto-regenerate the bundle
ctx-ray pack --watch

# 8. Copy straight to clipboard — zero files written
ctx-ray pack --clip
```

---

## Commands

### `ctx-ray pack [entry]`

The core command. Bundles files into `.ctx/ai-context.xml`.

| Flag | Description | Default |
|---|---|---|
| `[entry]` | Entry file — activates **surgical mode** | (full scan) |
| `-d, --depth <n>` | Max directory depth | unlimited |
| `-o, --output <file>` | Output filename | `ai-context.xml` |
| `--output-dir <dir>` | Output directory | `.ctx/` |
| `-l, --limit <n>` | Token limit for budget warning | `50000` |
| `--no-tree` | Omit directory blueprint | tree included |
| `--no-metadata` | Omit per-file metadata blocks | metadata included |
| `--no-gitignore` | Ignore `.gitignore` rules | respected |
| `--no-aiignore` | Ignore `.aiignore` rules | respected |
| `--exclude <patterns...>` | Extra glob patterns to exclude | — |
| `--diff` | Include only files changed vs HEAD | — |
| `--since <ref>` | Include files changed since git ref/time | — |
| `--append` | Append to existing bundle (incremental) | — |
| `--prompt <text>` | Embed custom instructions directly into bundle | — |
| `--prompt-file <path>` | Load instructions from a file and embed them | — |
| `-w, --watch` | Watch files and auto-regenerate the bundle | — |
| `--clip` | Copy XML to clipboard instead of writing | — |
| `--name <name>` | Named snapshot (`<name>.ctx.xml`) | — |
| `--tmp` | Auto-delete output after 5 minutes | — |

### `ctx-ray init`

Sets up ctx-ray in the current project:
- Creates `.ctx-ray.json` config
- Creates `.aiignore` template
- Adds `.ctx/` and `*.ctx.xml` to `.gitignore`
- Creates the `.ctx/` directory

### `ctx-ray ls`

Lists all XML bundles in the `.ctx/` directory.

### `ctx-ray clean`

Deletes all XML bundles in `.ctx/`. Prompts for confirmation unless `--force` is passed.

---

## Surgical Mode — How It Works

```bash
ctx-ray pack ./src/auth/login-handler.ts --depth 3
```

Instead of scanning everything, ctx-ray:

1. **Parses the AST** of `login-handler.ts` using `ts-morph`
2. **Traces all local imports** — static `import`, dynamic `import()`, and `require()`
3. **Follows transitive imports** up to `--depth` levels
4. **Skips node_modules** — only local project files are included

The result is a bundle that is typically **90% smaller** but **100% relevant**.

---

## Output Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<repository name="my-project" generated="2026-04-25T10:00:00.000Z" fileCount="12">
  <directory_blueprint><![CDATA[
my-project/
├── src/
│   ├── auth/
│   │   └── login-handler.ts
│   └── utils/
│       └── token.ts
  ]]></directory_blueprint>

  <files>
    <file path="src/auth/login-handler.ts">
      <metadata>
        <language>typescript</language>
        <last_modified>2026-04-25</last_modified>
        <size_bytes>3421</size_bytes>
        <complexity>Medium</complexity>
        <truncated>false</truncated>
      </metadata>
      <content><![CDATA[
// Your code here
      ]]></content>
    </file>
  </files>
</repository>
```

**Why XML?** Claude 3.5/3.7, Gemini 1.5/2.0, and GPT-4 all handle XML tags better than raw Markdown for large codebases. Tag pairing makes file boundaries explicit, eliminating the "Lost in the Middle" syndrome.

---

## ⚡ v2 Features

### Prompt Injection
Embed instructions directly into the bundle, so you can copy and paste the entire output to the LLM in one go.
```bash
ctx-ray pack --prompt "Find the memory leak in the login handler."
# OR
ctx-ray pack --prompt-file ./instructions.md
```
This generates an `<instruction>` block at the top of the bundle containing your prompt.

### Watch Mode
Keep your AI context up-to-date while you code. 
```bash
ctx-ray pack --watch
```
`ctx-ray` will watch the resolved files and re-bundle your context the moment you save a file.

---

## Smart Filtering

### `.aiignore`

Like `.gitignore`, but for AI context. Files here are excluded from bundles but **still tracked by Git**. ctx-ray creates a sensible template on `init`:

```gitignore
# .aiignore
package-lock.json
yarn.lock
*.png
*.svg
dist/
coverage/
*.min.js
*.map
```

### Smart Defaults (always applied)

Even without `.aiignore`, ctx-ray auto-skips:
- Lock files (`package-lock.json`, `yarn.lock`, etc.)
- Binary/media assets (images, fonts, videos, PDFs)
- Build outputs (`dist/`, `build/`, `.next/`)
- Minified files (auto-detected by line-length heuristic)
- Source maps (`*.map`)

---

## Token Budget

```bash
ctx-ray pack --limit 30000
```

```
  ⚠  Token budget exceeded: 87.3K / 30.0K

  Largest files by token count:
    ● src/generated/schema.ts     (41.2K tokens)
    ● src/data/fixtures.json      (18.9K tokens)

  Tip: Add these to .aiignore or use --exclude to reduce context size.
```

---

## Config File — `.ctx-ray.json`

```json
{
  "excludes": ["**/*.test.ts", "docs/**"],
  "tokenLimit": 50000,
  "outputDir": ".ctx",
  "outputFile": "ai-context.xml"
}
```

---

## Typical Workflow

```
1. ctx-ray init                          # One-time setup
2. ctx-ray pack ./src/feature/entry.ts   # Surgical bundle
3. Upload .ctx/ai-context.xml to AI      # Feed the model
4. Make changes...
5. ctx-ray pack --since "30 min ago"     # Refresh changed files only
6. ctx-ray pack --append                 # Add to existing bundle
7. ctx-ray clean                         # Purge when done
```

---

## Contributing

We welcome contributions! To get started:

1. **Install Dependencies:**
   This project uses `pnpm`. Make sure it is installed, then run:
   ```bash
   pnpm install
   ```
2. **Build and Test:**
   - To build the project: `pnpm run build`
   - To run tests: `pnpm test`
3. **Commits:**
   This project enforces the [Conventional Commits](https://www.conventionalcommits.org/) specification using `commitlint`. Husky hooks and `lint-staged` are configured to automatically format your code with Prettier and lint your commit messages.
   Example commit messages:
   - `feat: add surgical mode`
   - `fix: correct token count estimation`
   - `docs: update readme instructions`

---

## License

MIT
