# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Markdown Viewer — a Manifest v3 browser extension (Chrome/Chromium/Edge/Opera/Brave/Vivaldi + Firefox) that detects markdown responses and renders them in place. Extension source is plain vanilla JS with no bundler and no transpilation; only third-party dependencies get built into `vendor/`.

## Commands

There is no root `package.json`, no test suite, and no linter. Everything goes through shell build scripts.

```bash
sh build/package.sh chrome     # full build for Chrome (or `firefox`)
sh build/<dep>/build.sh        # rebuild a single dependency, e.g. build/prism/build.sh
sh build/themes/build.sh chrome  # themes/build.sh is the only one taking the browser arg
```

`build/package.sh` runs every `build/*/build.sh`, generates `themes/` and `vendor/`, copies the browser-specific manifest to the root as `manifest.json`, and produces `markdown-viewer.zip` (Chrome zips the wrapping folder, Firefox zips its contents).

Requires node >= 18, npm >= 10, git, zip. Each dependency build script does `npm ci || npm i`, builds, then `rm -rf node_modules/` — no persistent `node_modules` anywhere.

**A fresh clone cannot be loaded unpacked.** `themes/`, `vendor/`, `manifest.json` and `*.zip` are gitignored build artifacts; run `sh build/package.sh chrome` first, then load the repo root via `chrome://extensions` → Developer mode → Load unpacked. Never hand-edit those artifacts.

To verify a change: rebuild if you touched `build/`, reload the extension at `chrome://extensions`, then hard-reload a markdown page. Toggling any content option (`syntax`, `emoji`, `mermaid`, `mathjax`, `autoreload`) changes which files are injected, so it always requires a page reload — the background already broadcasts `{message: 'reload'}` for this.

## Architecture

### Two manifests, one source tree

`manifest.chrome.json` uses a service worker (`/background/index.js`, which pulls everything in via `importScripts`). `manifest.firefox.json` declares the same file list in `background.scripts`. **Any new background file must be added in both places, in the same order** — the load order is load-bearing (see below).

Firefox-specific behavior branches at runtime on `chrome.runtime.getBrowserInfo === undefined` or `/Firefox/.test(navigator.userAgent)`. `firefox.md` documents the platform limits worth knowing: Firefox needs markdown served as `text/plain`, autoreload doesn't work on `file:///`, and origins with strict CSP (e.g. `raw.githubusercontent.com`) can't be rendered at all.

### The `md` namespace and dependency wiring

`background/compilers/markdown-it.js` declares `var md = {compilers: {}}` and is the first non-vendor script loaded; every other background module attaches itself to `md` (`md.storage`, `md.detect`, `md.inject`, …). Each is a factory taking its dependencies explicitly, all wired in the IIFE at the bottom of `background/index.js`.

### Detection → injection → compilation

1. `chrome.tabs.onUpdated` → `detect.tab` (`background/detect.js`) runs an inline probe in the tab to read `location.href`, `document.contentType`, and `window.state`. A truthy `state` means the content script is already mounted (anchor navigation) — bail out.
2. `detect()` resolves the matching origin from `state.origins` by trying patterns from most to least specific (exact origin → hostname/host → wildcard subdomain → `*://*`), then applies that origin's `header` (content-type) and `path` (regex) checks.
3. `inject()` (`background/inject.js`) hides the page's `<pre>`, sets an `args` global carrying the relevant slice of state, inserts `content/index.css` + `content/themes.css`, then executes a **conditionally assembled** file list — vendor + content scripts only for the enabled `state.content` flags.
4. `content/index.js` reads the markdown out of the `<pre>`, strips YAML/TOML frontmatter (using `title:` to set `document.title`), and sends `{message: 'markdown'}` to the background.
5. `background/messages.js` tokenizes MathJax delimiters, calls `compilers[state.compiler].compile()`, detokenizes, and returns HTML. **Compilation happens in the background, never in the page** — the content script only post-processes: emoji → rewrite mermaid code classes → build ToC → add anchors, then renders through Mithril.

Related quirks in this flow: `detect.js` pings the tab first on Firefox before probing, and the `onwakeup` flag causes a one-time `tabs.reload` instead of an inject on the first detection after a service-worker wakeup when `webRequest` is present.

Because content scripts can't inject scripts themselves, Prism languages and MathJax extensions are lazy-loaded by messaging the background (`{message: 'prism', language}` / `{message: 'mathjax', extension}`), which runs `chrome.scripting.executeScript` into the tab.

### Compilers

Three parsers live side by side in `background/compilers/`: `markdown-it` (default), `marked`, `remark`. Each exports a factory carrying `{defaults, description, compile}` and is also decorated with `defaults`/`description` statically so `storage.defaults` can read them before instantiation. `description` strings are the tooltips shown on the popup switches, and the boolean keys of `defaults` are what the popup enumerates — adding a compiler option means adding it to `defaults` + `description` + the `.use(...)` chain, plus a storage migration.

Which plugins get bundled is defined by the `build/<compiler>/*.mjs` entry points rolled up into `vendor/<compiler>.min.js`.

### Storage and migrations

`background/storage.js` keeps the whole settings object in `chrome.storage.sync` and mirrors it into an in-memory `state` that every module reads synchronously. `md.storage.migrations(state)` mutates old shapes forward on every load, organized as `// vX -> vY` blocks — **append a new block for any schema change** rather than assuming fresh defaults. The 8KB `QUOTA_BYTES_PER_ITEM` limit is what caps custom theme size (handled in the `custom.set` handler).

### Permissions model

Only `file:///*` is a static host permission. Every other origin is granted at runtime via `chrome.permissions.request` from the options page (`options/origins.js`) and mirrored into `state.origins`. Sync carries `origins` but cannot carry the granted permissions, so `md.storage.bug` reconciles the two on startup and the options page highlights origins needing a manual `Refresh`.

`webRequest` is an optional permission requested and removed as `content.autoreload` is toggled (`background/webrequest.js`); its only job is spotting a non-localhost IP and telling that tab to stop polling.

### UI layer

Mithril + Material Design Components 0.3x, plus Bootstrap on the options page. All UI state changes go through `chrome.runtime.sendMessage` into the single if/else dispatcher in `background/messages.js`, namespaced by prefix (`popup.*`, `options.*`, `origin.*`, `custom.*`).

`popup/index.js` is shared by both surfaces: `Popup()` returns `render()` (popup layout) and `options()` (the same controls embedded in the options page), branching on `document.querySelector('.is-popup')`. The options page additionally loads `Origins()`, `Settings()`, and `Custom()` (which minifies uploaded CSS with csso in-page before saving).

Adding a user-facing setting therefore touches four places: `md.storage.defaults`, a migration block, a `messages.js` handler, and the UI control.

### Theming

Themes are generated CSS files in `themes/` (GitHub themes + cleanrmd themes, minified by `build/themes/build.sh`, then patched by `build/themes/fix-themes.js` — which is also where the browser-specific `chrome-extension://` vs `moz-extension://` anchor-icon URL gets rewritten).

At runtime `content/index.js` injects `<link href="/themes/<name>.css">` and stamps the body with `_theme-<name>`, `_color-<light|dark>`, and `_width-<size>` classes; `content/index.css` and `content/themes.css` hang all their overrides off those classes. `custom` is a pseudo-theme rendered from `state.custom.theme` as an inline `<style>`.

Three lists must stay in sync when adding or removing a theme: `state._themes` in `content/index.js` (theme → `light`/`dark`/`auto`), `state._themes` in `popup/index.js` (the select options), and the `npx csso` lines in `build/themes/build.sh`.

## Repository and PRs

`origin` is a fork — `nundefined/markdown-viewer`. The upstream project it was forked from is `simov/markdown-viewer`.

- **Upstream is out of scope.** Never open a PR, push a branch, or file an issue against `simov/markdown-viewer`, and never add it as a remote. `gh pr create` defaults to the *parent* repo for forks, so always pass `--repo nundefined/markdown-viewer --base main` explicitly.
- Every task and every PR targets **`main` on this fork**: branch off it, PR back into it.

## Conventions

- Match the existing style: `var` (not `let`/`const`), arrow functions, no semicolons, leading-semicolon IIFEs, 2-space indent, LF, trailing whitespace trimmed (see `.editorconfig`).
- Releases bump `version` in **both** manifests and add a `CHANGELOG.md` entry.
- Dependency upgrades touch `build/<dep>/package.json` and the version table in `build/README.md`.
- A separate `compilers` branch adds further parsers (hence the gitignored `/background/index-compilers.js`); keep the compiler factory contract intact so it stays mergeable.
