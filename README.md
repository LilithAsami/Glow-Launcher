# GLOW Launcher v0.1

A minimalist, dark-themed desktop launcher built with **Electron + TypeScript + esbuild**.

![GLOW Banner](assets/banner.png)

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [File Descriptions](#file-descriptions)
- [Adding a New Page](#adding-a-new-page)
- [Commands](#commands)
- [Image Assets](#image-assets)

---

## Overview

GLOW Launcher is a lightweight, extensible desktop app with:

- **Custom frameless window** with a draggable title bar and window controls
- **Sidebar navigation** auto-generated from a page registry
- **JSON file-based storage** (no database) — settings persist across sessions
- **Page system** — add new sections by creating a single `.ts` file and registering it
- **esbuild** for near-instant builds

---

## Project Structure

```
GLOW LAUNCHER v0.1/
│
├── assets/                          # Image assets
│   ├── banner.png                   #   Header logo banner
│   └── icon.png                     #   Taskbar / app icon
│
├── scripts/
│   └── build.js                     # esbuild compile & asset copy script
│
├── src/
│   ├── shared/
│   │   └── types.ts                 # Shared TypeScript types (PageDefinition, GlowAPI, etc.)
│   │
│   ├── main/                        # Electron main process (Node.js)
│   │   ├── index.ts                 #   App entry — creates BrowserWindow
│   │   ├── ipc.ts                   #   IPC handler registration
│   │   └── storage.ts               #   JSON file storage engine
│   │
│   ├── preload/
│   │   └── index.ts                 # Context bridge — exposes safe API to renderer
│   │
│   └── renderer/                    # Browser / UI layer
│       ├── index.html               #   HTML shell
│       ├── styles.css               #   Complete stylesheet (dark theme, glow accents)
│       ├── index.ts                 #   Renderer entry point — bootstraps the app
│       │
│       ├── core/                    #   Core UI modules
│       │   ├── header.ts            #     Custom title bar (logo + window controls)
│       │   ├── sidebar.ts           #     Sidebar builder — reads page registry
│       │   └── router.ts            #     Client-side page router with lifecycle hooks
│       │
│       └── pages/                   #   Page definitions
│           ├── registry.ts          #     ★ Master list — import & register pages here
│           ├── home.ts              #     Home page (example)
│           └── settings.ts          #     Settings page (example, pinned to bottom)
│
├── dist/                            # Build output (auto-generated, git-ignored)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## How It Works

### Boot Sequence

1. **Electron starts** → `src/main/index.ts` runs
2. Main process creates a **frameless BrowserWindow** and registers IPC handlers
3. **Preload script** (`src/preload/index.ts`) exposes `window.glowAPI` via `contextBridge`
4. **Renderer loads** `index.html` → `bundle.js` runs
5. `src/renderer/index.ts` initialises the **header**, **sidebar**, and **router**
6. Router renders the **first page** from the registry

### Navigation Flow

```
User clicks sidebar button
  → sidebar calls router.navigate(pageId)
    → router calls cleanup() on the previous page
    → router clears #content
    → router calls render(container) on the new page
    → sidebar highlights the active button
```

### Storage

Settings are persisted as individual JSON files inside the Electron `userData/data/` folder:

- Each key maps to a `.json` file (e.g. `config` → `config.json`)
- Accessible from the renderer via `window.glowAPI.storage.get/set/delete`
- The main process reads/writes using `fs` — no database, no dependencies

### Build Pipeline

`scripts/build.js` uses **esbuild** to:

1. Bundle `src/main/index.ts` → `dist/main/index.js` (Node/CJS)
2. Bundle `src/preload/index.ts` → `dist/preload/index.js` (Node/CJS)
3. Bundle `src/renderer/index.ts` → `dist/renderer/bundle.js` (browser/IIFE)
4. Copy `index.html`, `styles.css`, and `assets/*` images into `dist/renderer/`

---

## File Descriptions

| File | Purpose |
|---|---|
| **`src/shared/types.ts`** | Central type definitions: `PageDefinition` (page contract), `GlowAPI` (preload API shape), `AppConfig` (persisted settings) |
| **`src/main/index.ts`** | Electron entry. Creates the window, loads the HTML, persists window bounds on close |
| **`src/main/ipc.ts`** | Registers `ipcMain` handlers for `storage:get/set/delete` and `window:minimize/maximize/close` |
| **`src/main/storage.ts`** | `Storage` class — reads/writes JSON files in `userData/data/`, one file per key |
| **`src/preload/index.ts`** | Uses `contextBridge.exposeInMainWorld` to create `window.glowAPI` — the safe bridge between renderer and main |
| **`src/renderer/index.html`** | Minimal HTML shell with CSP, loads `styles.css` and `bundle.js` |
| **`src/renderer/styles.css`** | Full dark-theme stylesheet with CSS variables, sidebar styles, cards, settings, scrollbar, etc. |
| **`src/renderer/index.ts`** | Renderer bootstrap — imports pages, initialises header, sidebar, and router |
| **`src/renderer/core/header.ts`** | Builds the custom title bar: GLOW banner image + minimize/maximize/close buttons |
| **`src/renderer/core/sidebar.ts`** | Reads the page registry, sorts by `order`, splits `top`/`bottom` groups, creates nav buttons |
| **`src/renderer/core/router.ts`** | `Router` class — manages current page, calls `render()`/`cleanup()` lifecycle hooks, notifies listeners |
| **`src/renderer/pages/registry.ts`** | Master page array — import every page here and add it to the exported list |
| **`src/renderer/pages/home.ts`** | Example "Home" page with welcome cards |
| **`src/renderer/pages/settings.ts`** | Example "Settings" page with info items, pinned to sidebar bottom |
| **`scripts/build.js`** | Node script that runs esbuild for all 3 bundles and copies static assets |

---

## Adding a New Page

**3 steps — ~30 seconds:**

### 1. Create the page file

Create a new `.ts` file inside `src/renderer/pages/`, e.g. `tools.ts`:

```ts
import type { PageDefinition } from '../../shared/types';

export const toolsPage: PageDefinition = {
  id: 'tools',
  label: 'Tools',
  icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77
                   a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91
                   a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>`,
  order: 20,          // lower = higher in sidebar
  // position: 'bottom',  // uncomment to pin at the bottom

  render(container: HTMLElement): void {
    container.innerHTML = `
      <h1 class="page-title">Tools</h1>
      <p class="page-subtitle">Your custom tools go here</p>
    `;
  },

  cleanup(): void {
    // Optional: runs when navigating away from this page
  },
};
```

### 2. Register it

Open `src/renderer/pages/registry.ts` and add the import + entry:

```ts
import { toolsPage } from './tools';

export const pages: PageDefinition[] = [
  homePage,
  toolsPage,   // ← add here
  settingsPage,
].sort((a, b) => a.order - b.order);
```

### 3. Rebuild

```bash
npm run dev
```

The new "Tools" button appears in the sidebar automatically.

---

## PageDefinition Reference

| Property | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✓ | Unique kebab-case identifier |
| `label` | `string` | ✓ | Sidebar button text |
| `icon` | `string` | ✓ | Inline SVG (18×18 recommended) |
| `order` | `number` | ✓ | Sort position — lower = higher |
| `position` | `'top' \| 'bottom'` | | `'bottom'` pins to sidebar footer |
| `render` | `(container: HTMLElement) => void` | ✓ | Called when the page becomes active |
| `cleanup` | `() => void` | | Called when navigating away |

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Build + launch the app |
| `npm run build` | Compile only (no launch) |
| `npm start` | Launch from existing build |
| `npm run typecheck` | Run TypeScript type-checking |

---

## Image Assets

Place your images in the `assets/` folder at the project root:

| File | Usage | Recommended Size |
|---|---|---|
| `assets/banner.png` | Header logo (top-left of the title bar) | ~200×24 px (or similar aspect) |
| `assets/icon.png` | App icon (taskbar, window corner) | 256×256 px or 512×512 px |

The build script automatically copies all images from `assets/` into `dist/renderer/assets/` so they're available at runtime.

> **Tip:** For the taskbar icon on Windows, a `.png` of 256×256 works well. Electron handles the conversion internally.
