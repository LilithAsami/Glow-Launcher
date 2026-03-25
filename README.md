<div align="center">

# GLOW Launcher

**A feature-rich Electron desktop launcher for Fortnite**  
Built for Save the World, Battle Royale, and Epic account automation.

`v2.3.1` · `Electron 28` · `TypeScript` · `esbuild`

</div>

---

## Overview

GLOW Launcher is a fully custom Electron application with a frameless, dark-themed UI that acts as a control center for all things Fortnite. It authenticates against the Epic Games backend using device auth, manages multiple accounts simultaneously, and exposes a full surface of automation, cosmetics, and account tools across **29 pages** organized into **5 sidebar groups**.

All IPC communication follows a strict contextIsolation model — zero `nodeIntegration` exposure, everything proxied through a typed `window.glowAPI` preload surface.

---

## Features at a Glance

| Category | Features |
|---|---|
| **Multi-account** | Add accounts via Device Auth, Device Code, Exchange Code, or Authorization Code. Import from other launchers. Reorder, remove, set main account. |
| **STW Automation** | Auto-kick bots from missions, auto-collect daily login rewards, auto-manage expeditions, auto-claim V-Bucks mission alerts. |
| **STW Tools** | View mission alerts by zone, open llamas, manage quests & rerolls, activate XP boosts, dupe exploit, party management, player stalking. |
| **STW Base** | Homebase outpost viewer with zone levels, amplifier data, endurance wave records, and full base structure scan (walls/floors/stairs/traps). |
| **File Tweaks** | DevBuild toggle, DevStairs toggle, AirStrike toggle, trap height editor per GUID, worker power setter. All backed by direct game file patching. |
| **Taxi Bot** | Per-account automated party/taxi system with cosmetic selector (skin + emote), whitelist management, cooldown tracking, and activity logs. |
| **Party** | View party members, invite/kick/promote, toggle public/private, fix invite permissions, join by display name or ID. |
| **Status Spoofing** | Set custom XMPP presence status per account with message, platform (Win/PS/XBL/iOS/Android/Switch/Mac), and presence mode (Online/Away/DND). |
| **Auto Responder** | MITM HTTP/HTTPS proxy that intercepts all app traffic. Rule editor with pattern matching, file-backed response overrides, and a live traffic viewer. |
| **BR Shop** | Item Shop with full rarity/series color theming, owned tracking, in-app purchase and gifting. |
| **BR Locker** | Equip cosmetics from owned inventory with slot pickers and a locker card image generator (via sharp). |
| **Ghost Equip** | Equip cosmetics to your party presence without owning them (outfit, backpack, emote, shoes, banner, crown count, level). |
| **V-Bucks** | V-Bucks breakdown by type (purchased/earned/promotional) across all eligible platforms. |
| **Gifts** | Gift history viewer with per-sender expansion and item details fetched from fortnite-api.com. |
| **Epic Account** | Display name, email, phone, language edits; device auth list and deletion; ban check; EULA/Privacy acceptance tracking. |
| **Friends** | Full friends list with incoming/outgoing tabs. Add, remove, block, accept, reject, cancel, remove all, accept all. |
| **Epic Status** | Live Epic Games service health dashboard with per-service status, incident history, and auto-refresh every 3 minutes. |
| **Redeem Codes** | Redeem Epic and Fortnite codes, view friend code inventory. |
| **MCP Browser** | Schema-driven MCP operation browser showing all profile operations with payload field definitions, types, and required/optional tags. |
| **Auth Viewer** | Display and generate Device Auth info, Access Tokens, Exchange Codes, Continuation Tokens, and Token verification. |
| **FN Launch Settings** | Full Fortnite GameUserSettings.ini editor split into Video (Display/Graphics/Quality/Advanced), Launch Args, and Process Killer tabs. Arrow `‹ value ›` controls for all discrete settings. |
| **Discord RPC** | Configurable Discord Rich Presence showing current page and custom detail strings. |
| **Notifications** | In-app notification center with unread badge, per-category settings (sound, toast), and full history. |
| **Settings** | Per-page visibility toggles per group, Fortnite path, minimize-to-tray, launch-on-startup, Discord RPC, page backgrounds. |

---

## Pages Overview

### STW — Save the World

| Page | Label | Description |
|---|---|---|
| `alerts.ts` | Alerts | STW mission alerts by zone (Stonewood / Plankerton / Canny / Twine). Expandable mission rows with reward items. Real-time world info fetch with V-Bucks/SR/schematic filters on the home dashboard. |
| `llamas.ts` | Llamas | Open STW card-pack llamas per account. Game-accurate card UI per llama type with quantity and Claim / Claim All buttons. Activity log with live progress. Horizontally scrollable layout. |
| `quests.ts` | Quests | Daily and weekly STW quests with categories, completion states, daily reroll count, and per-quest reroll button. |
| `dupe.ts` | Dupe | Executes the STW lobby dupe exploit (requires FORTOUTPOST homebase state). Countdown timer display, automatic retry on profile-locked errors. |
| `party.ts` | Party | Full party management: member cards, invite/kick/promote, join by name or ID, public/private toggle, fix invite permissions, player search. |
| `xpboosts.ts` | XP Boosts | Activate Personal or Teammate STW XP Boosts. Inventory quantity display, boost type selector, amount controls, target player search for teammate boosts. |
| `stalk.ts` | Stalk | Real-time matchmaking session lookup for STW. Debounced display-name search returning active lobby sessions. |
| `outpost.ts` | Outpost | Homebase outpost viewer: zone levels, amplifier counts, endurance wave data. Full base structure scan showing walls, floors, stairs, and trap inventory with icons and counts. |

### Automated Systems

| Page | Label | Description |
|---|---|---|
| `files.ts` | Files | Game file tweaker: DevBuild toggle, DevStairs toggle, AirStrike toggle, Worker Power setter, and a full trap-height editor per GUID (with presets, revert, and family info). |
| `taxi.ts` | Taxi | Per-account taxi automation. Account cards with connect status, cosmetic picker (skin + emote), whitelist management, cooldown tracking, and per-account activity logs. |
| `autokick.ts` | AutoKick | Automated mission monitor that kicks unwanted players from STW missions per account. Per-account enable/disable cards with connection state (Connected / Connecting / Error / Disabled) and activity logs. |
| `autodaily.ts` | Auto Daily | Automatic STW daily login reward collection. Per-account toggle cards showing active/disabled state and last collection timestamp. |
| `expeditions.ts` | Expeditions | Fully automated STW expedition management. Config per account with reward type filters. Actions: send, collect, abandon. Live browser for sent/completed/available expeditions with power ratings and durations. |
| `status.ts` | Status | XMPP presence status manager: activate/deactivate per account, custom message, platform (Win/PS/XBL/iOS/Android/Switch/Mac), presence mode (Online/Away/DND). |
| `autoresponder.ts` | Auto Responder | MITM HTTP/HTTPS proxy intercepting all app traffic. Master toggle, live traffic counter, rule editor with URL pattern matching and file-backed overrides, full traffic viewer with request/response details. Certificate management included. |

### Epic Games

| Page | Label | Description |
|---|---|---|
| `friends.ts` | Friends | Friends list with Friends/Incoming/Outgoing tabs. Add by name or ID, remove, block, accept, reject, cancel, remove all, accept all. |
| `epicaccount.ts` | Epic Account | Multi-tab account manager: Security (device auth list, ban check, account info), Account (edit display name, email, phone, language), EULA (acceptance tracking for EULA and Privacy Policy). |
| `epicstatus.ts` | Epic Status | Epic Games service health dashboard. Per-service operational/degraded/outage indicators, active incidents with impact levels. Auto-refreshes every 3 minutes. |
| `redeemcodes.ts` | Redeem Codes | Redeem Epic Games and Fortnite codes on the active account. Auto-strips dashes. Shows success/error results and lists available friend codes. |

### Battle Royale

| Page | Label | Description |
|---|---|---|
| `shop.ts` | Shop | Item Shop with full rarity/series color theming (Common → Mythic/Exotic plus Marvel, DC, Star Wars, Icon, Gaming, Collab series). Collapsible sections, owned tracking, in-app purchase and gifting with message. Image retry logic (up to 14 retries). |
| `locker.ts` | Locker | Two-mode locker page: cosmetic equip picker (skins/backpacks/emotes/shoes) filtered by type/rarity/chapter/exclusive toggle; and locker card image generator using sharp (download as PNG). |
| `vbucks.ts` | V-Bucks | V-Bucks breakdown across all platforms — total, purchased, earned, promotional — shown as individual stat cards with account name and refresh. |
| `gifts.ts` | Gifts | Gift history viewer. Per-sender expandable cards showing gifted items with dates. Item details fetched from fortnite-api.com with local cache. Search all Athena items. |
| `ghostequip.ts` | Ghost Equip | Equip cosmetics to party presence without owning them. Tabs: Outfit, Backpack, Emote, Shoes, Banner, Crowns, Level. Full cosmetic picker with image caching and search. |

### Utility

| Page | Label | Description |
|---|---|---|
| `fnlaunch.ts` | FN Launch | Fortnite GameUserSettings.ini editor. Three tabs: **Video** (Display, Graphics, Graphics Quality, Advanced Graphics Quality sections with `‹ value ›` arrow controls), **Launch Args** (custom command-line flags), **Process Killer** (auto-kill target processes on launch). Save buttons show `Saved ✓` confirmation for 2 seconds. |
| `mcp.ts` | MCP | Schema-driven MCP operation browser. Lists all available profile operations with payload field definitions showing name, type, required/optional, and description. Execute any operation against any profile. |
| `authPage.ts` | Auth | Auth credential viewer. Cards for Device Auth info, Access Token, Exchange Code, Continuation Token, and Token Verifier (paste and verify any token). |

### Hidden / Special Pages

| Page | Access | Description |
|---|---|---|
| `home.ts` | Logo click | Dashboard with pre-fetched world info. Overview and Summary tabs. Mission alert browser filterable by reward type (V-Bucks, Legendary Schematic, etc). Data pre-fetched at app startup. |
| `accounts.ts` | Toolbar / First run | Account manager and TOS gate. Auth methods: Device Auth, Device Code, Exchange Code, Authorization Code. Import from other launchers. Account list with reorder, remove, set-main. |
| `settings.ts` | Toolbar gear | App configuration: Fortnite install path, per-group page visibility toggles, minimize-to-tray, launch-on-startup, Discord RPC enable, per-page background images, notification settings (sound/toast/categories). |

---

## Project Structure

```
GLOW LAUNCHER v0.1/
├── src/
│   ├── main/
│   │   ├── index.ts                  # Electron main process, BrowserWindow setup
│   │   ├── ipc.ts                    # All ipcMain.handle() registrations
│   │   ├── storage.ts                # JSON-backed per-key Storage class
│   │   ├── events/                   # Long-running background event loops
│   │   │   ├── autodaily/            # Daily reward cron runner
│   │   │   ├── autokick/             # XMPP-connected mission monitor
│   │   │   │   └── monitor.ts
│   │   │   └── expeditions/          # Expedition automation event loop
│   │   ├── managers/                 # Stateful service managers
│   │   │   ├── autoresponder.ts      # MITM HTTP/HTTPS proxy (node-forge)
│   │   │   ├── logger.ts             # Shared structured logger
│   │   │   ├── discord/
│   │   │   │   └── DiscordRpcManager.ts
│   │   │   ├── expeditions/          # ExpeditionManager + controllers + helpers
│   │   │   ├── locker/               # Locker image gen (sharp) + UI assets
│   │   │   │   ├── generateLocker.ts
│   │   │   │   ├── lockerManager.ts
│   │   │   │   └── UI/               # Burbark font, rarity/series PNGs
│   │   │   ├── notifications/
│   │   │   │   └── NotificationManager.ts
│   │   │   ├── party/                # PartyManager + member/meta models
│   │   │   ├── shop/
│   │   │   │   └── ShopManager.ts
│   │   │   ├── status/
│   │   │   │   └── StatusManager.ts
│   │   │   └── taxi/
│   │   │       └── TaxiManager.ts
│   │   ├── helpers/
│   │   │   ├── endpoints.ts          # Epic API endpoint constants
│   │   │   ├── auth/                 # Auth helpers
│   │   │   │   ├── auth.ts           # Token exchange + device auth
│   │   │   │   ├── clients.ts        # Epic HTTP client factories
│   │   │   │   ├── importAccounts.ts # Import from other launchers
│   │   │   │   ├── security.ts       # Device auth list/deletion, ban check
│   │   │   │   └── tokenRefresh.ts   # Automatic token refresh loop
│   │   │   ├── cmd/                  # Thin Epic API command wrappers
│   │   │   │   ├── airstrike.ts
│   │   │   │   ├── devbuilds.ts
│   │   │   │   ├── devstairs.ts
│   │   │   │   ├── dupe.ts
│   │   │   │   ├── fnlaunch.ts       # GameUserSettings.ini read/write
│   │   │   │   ├── gifts.ts
│   │   │   │   ├── launcher.ts       # Fortnite process start/kill
│   │   │   │   ├── redeemcodes.ts
│   │   │   │   ├── trapheight.ts
│   │   │   │   ├── vbucks.ts
│   │   │   │   └── xpboosts.ts
│   │   │   ├── epic/                 # Epic account API wrappers
│   │   │   │   ├── accountmgmt.ts
│   │   │   │   ├── authPage.ts
│   │   │   │   ├── epicstatus.ts
│   │   │   │   ├── eula.ts
│   │   │   │   ├── friends.ts
│   │   │   │   ├── ghostequip.ts
│   │   │   │   ├── mcp.ts
│   │   │   │   ├── outpost.ts
│   │   │   │   ├── party.ts
│   │   │   │   ├── stalk.ts
│   │   │   │   ├── status.ts
│   │   │   │   └── taxi.ts
│   │   │   └── stw/                  # STW-specific API helpers
│   │   │       ├── alerts.ts
│   │   │       ├── quests.ts
│   │   │       ├── workerpower.ts
│   │   │       └── worldinfo.ts
│   │   └── utils/
│   │       ├── map/                  # Asset map utilities
│   │       └── mcp.ts                # MCP operation schema utilities
│   ├── renderer/
│   │   ├── index.html                # Single-page shell
│   │   ├── index.ts                  # Renderer entry — router, sidebar, toolbar
│   │   ├── styles.css                # Global CSS variables + all component styles
│   │   └── pages/
│   │       ├── registry.ts           # All page definitions + sidebar group config
│   │       ├── home.ts               # Dashboard (logo click)
│   │       ├── accounts.ts           # Account manager / TOS gate (toolbar)
│   │       ├── settings.ts           # App settings (toolbar gear)
│   │       │ —— STW ——
│   │       ├── alerts.ts
│   │       ├── llamas.ts
│   │       ├── quests.ts
│   │       ├── dupe.ts
│   │       ├── party.ts
│   │       ├── xpboosts.ts
│   │       ├── stalk.ts
│   │       ├── outpost.ts
│   │       │ —— AUTOMATED SYSTEMS ——
│   │       ├── files.ts
│   │       ├── taxi.ts
│   │       ├── autokick.ts
│   │       ├── autodaily.ts
│   │       ├── expeditions.ts
│   │       ├── status.ts
│   │       ├── autoresponder.ts
│   │       │ —— EPIC GAMES ——
│   │       ├── friends.ts
│   │       ├── epicaccount.ts        # Tabs: Security / Account / EULA
│   │       ├── security.ts           # Sub-view: Security tab
│   │       ├── accountmgmt.ts        # Sub-view: Account tab
│   │       ├── eula.ts               # Sub-view: EULA tab
│   │       ├── epicstatus.ts
│   │       ├── redeemcodes.ts
│   │       │ —— BATTLE ROYALE ——
│   │       ├── shop.ts
│   │       ├── locker.ts
│   │       ├── vbucks.ts
│   │       ├── gifts.ts
│   │       ├── ghostequip.ts
│   │       │ —— UTILITY ——
│   │       ├── fnlaunch.ts
│   │       ├── mcp.ts
│   │       └── authPage.ts
│   └── preload/
│       └── index.ts                  # contextBridge — exposes window.glowAPI
├── assets/                           # Icons, images, background assets
├── scripts/
│   └── build.js                      # esbuild pipeline (main + renderer + preload)
├── dist/                             # Compiled output (git-ignored)
├── release/                          # electron-builder output
└── package.json
```

---

## Architecture

### How It Works

```
┌──────────────────────────────────────────────────────┐
│                   Renderer Process                    │
│  index.ts → router → draws pages into #content       │
│  Pages: draw() + bindEvents() + PageDefinition export │
│  Communicates ONLY via window.glowAPI (preload)       │
└────────────────────┬─────────────────────────────────┘
                     │  contextBridge (IPC)
┌────────────────────▼─────────────────────────────────┐
│                    Main Process                       │
│  ipcMain.handle() handlers per domain                 │
│  Epic API calls via fnbr.js + axios                   │
│  Automation engines: autokick, taxi, expeditions …    │
│  File patching, MITM proxy, locker image gen          │
│  Storage: userData/data/<key>.json                    │
└──────────────────────────────────────────────────────┘
```

### Page Pattern

Every page follows this exact pattern:

```typescript
// 1. Module-level element refs + state
let el: HTMLElement;
let state: MyState = defaultState;

// 2. Render function
function draw() {
  el.innerHTML = `...`;
  bindEvents();
}

// 3. Event wiring (called inside draw after innerHTML)
function bindEvents() { ... }

// 4. Export as PageDefinition
export const myPage: PageDefinition = {
  id: 'my-page',
  label: 'My Page',
  icon: '🔧',
  init(container) {
    el = container;
    loadData().then(draw);
  },
};
```

Pages are registered in `registry.ts` and assigned to sidebar groups. The router calls `page.init(container)` on first navigation and `page.refresh?.()` on subsequent visits.

---

## API Surface — `window.glowAPI`

All renderer↔main communication goes through `window.glowAPI`, exposed via `contextBridge` in `src/preload/index.ts`.

| Namespace | Description |
|---|---|
| `storage` | Key-value JSON storage (`get` / `set` / `delete`) |
| `settings` | Notify main of tray and startup setting changes |
| `window` | Frameless window controls (minimize / maximize / close) |
| `accounts` | Full account lifecycle: add, remove, reorder, set-main, device auth, avatars, auth-update events |
| `autokick` | Toggle per-account, update config, status + log push events |
| `security` | Account info, device auth list/deletion, ban check, exchange URL |
| `shell` | `openExternal(url)` — safely opens URLs in system browser |
| `launch` | Start / kill Fortnite process, launch status push events |
| `dialog` | Native `openDirectory` / `openFile` pickers |
| `alerts` | Fetch STW world missions (cached + force-refresh) |
| `locker` | Generate locker image (with filters), save image to disk |
| `lockermgmt` | Get loadout, owned items per slot, resolve item IDs, equip cosmetic |
| `files` | WorldInfo fetch, worker power, DevBuild/DevStairs/AirStrike toggles, trap height list/apply/revert/data |
| `dupe` | Execute dupe exploit, status push events |
| `vbucks` | V-Bucks breakdown by platform/type |
| `epicStatus` | Fetch all Epic Games service statuses |
| `redeemCodes` | Redeem code, get friend codes |
| `xpBoosts` | Get boost profile, consume personal or teammate boosts |
| `mcp` | Execute any MCP operation against any profile |
| `outpost` | Homebase outpost info, base structure data |
| `stalk` | Player search, matchmaking session lookup |
| `party` | Info, leave, kick, invite, join, promote, privacy, fix-invite, search |
| `eula` | Accept EULA / Privacy Policy |
| `authPage` | Device auth info, generate access token / exchange code / continuation token, verify token |
| `status` | Activate / deactivate XMPP status per account, update message, get info, connection + data events |
| `taxi` | Activate/deactivate per account, update config, whitelist, status + log + cooldown push events |
| `shop` | Get items, buy, gift, toggle gifting, get friends/V-Bucks/owned items, shop rotation event |
| `ghostequip` | Set outfit / backpack / emote / shoes / banner / crowns / level |
| `accountMgmt` | Get account info, update specific field (name, email, language, etc.) |
| `friends` | Summary (friends/incoming/outgoing), add, remove, accept, reject, cancel, block, removeAll, acceptAll |
| `expeditions` | Status, toggle per account, update config, run cycle, list, send, collect, abandon, log + data events |
| `quests` | Get all quests (with optional lang), reroll quest |
| `autodaily` | Status, toggle per account, run now, log + data events |
| `autoresponder` | Enable, add/update/delete/toggle rules, logs, test pattern, browse file, traffic viewer, cert install, proxy status |
| `discordRpc` | Set page / detail / enabled, get status, status push event |
| `notifications` | Get all, unread count, mark read/all-read, clear, delete, settings get/update, new + updated push events |
| `llamas` | Get llamas for account, open llama packs, log push event |
| `memory` | Get usage, trigger cleanup, restart auto-cleanup timer |
| `gifts` | Get gift history info |
| `fnlaunch` | Get/save game settings (Video), get/save launch settings (args + killer) |

---

## Backend Modules

| Module | Path | Purpose |
|---|---|---|
| Storage | `storage.ts` | Per-key JSON files in `userData/data/`. Sync read, async write. |
| IPC | `ipc.ts` | All `ipcMain.handle()` registrations in one file |
| Epic Auth | `helpers/auth/auth.ts` | Device auth exchange, login flow |
| Token Refresh | `helpers/auth/tokenRefresh.ts` | Automatic access token refresh loop |
| Account Import | `helpers/auth/importAccounts.ts` | Import accounts from other Fortnite launchers |
| Security | `helpers/auth/security.ts` | Device auth list/deletion, ban status check |
| FN Launch | `helpers/cmd/fnlaunch.ts` | Reads/writes `GameUserSettings.ini` (INI section parsing) |
| Launcher | `helpers/cmd/launcher.ts` | Start/kill the Fortnite process |
| File Tweaks | `helpers/cmd/devbuilds.ts`, `devstairs.ts`, `airstrike.ts`, `trapheight.ts` | Direct game file patching |
| STW Helpers | `helpers/stw/` | World info, mission alerts, quests, worker power |
| Epic Helpers | `helpers/epic/` | Friends, MCP, party, stalk, eula, account mgmt, ghostequip, outpost, status, taxi, epicstatus, authPage |
| AutoKick | `events/autokick/monitor.ts` | XMPP-connected mission monitor, kicks per lobby rules |
| Auto Daily | `events/autodaily/` | Cron-based daily login reward collection per account |
| Expeditions | `managers/expeditions/` | Full expedition manager with send/collect/abandon controllers |
| Taxi | `managers/taxi/TaxiManager.ts` | Party automation engine with whitelist, cosmetics, cooldown |
| Status | `managers/status/StatusManager.ts` | XMPP presence management per account |
| Party | `managers/party/PartyManager.ts` | In-process party management (member meta, patches) |
| Shop | `managers/shop/ShopManager.ts` | Item shop cache, purchase, gift, rotation detection |
| Auto Responder | `managers/autoresponder.ts` | HTTP(S) MITM proxy using `node-forge` CA + TLS interception |
| Locker Gen | `managers/locker/` | Card image generation pipeline using `sharp` (Burbark font, rarity/series art) |
| Notifications | `managers/notifications/NotificationManager.ts` | In-app notification store + push events to renderer |
| Discord RPC | `managers/discord/DiscordRpcManager.ts` | Discord Rich Presence via `discord.js` RPC |
| Logger | `managers/logger.ts` | Structured logger shared across all modules |

---

## Adding a New Page

1. **Create** `src/renderer/pages/mypage.ts` following the page pattern above.
2. **Export** a `PageDefinition` object with `id`, `label`, `icon`, and `init`.
3. **Register** it in `src/renderer/pages/registry.ts`:
   - Import the page definition.
   - Add it to the correct `sidebarGroups` entry (or `hiddenPages`).
4. **Add IPC** (if needed):
   - Add a handler in `src/main/ipc/` using `ipcMain.handle`.
   - Expose the call in `src/preload/index.ts` under a new or existing namespace.
   - Add the TypeScript type in `src/renderer/types/` if needed.
5. **Build** and test: `npm run build && npm start`.

---

## Commands

| Command | Description |
|---|---|
| `npm run build` | Production build (esbuild — main + renderer + preload) |
| `npm start` | Start Electron from `dist/` (requires prior build) |
| `npm run dev` | Build then start (full dev cycle) |
| `npm run typecheck` | TypeScript check without emitting |
| `npm run pack` | Build + package into `release/` (unpacked, no installer) |
| `npm run dist` | Build + full installer (NSIS `.exe`) |

---

## Build & Distribution

- **Bundler:** esbuild via `scripts/build.js`
  - Main: `src/main/index.ts` → `dist/main/index.js` (CJS, Node platform)
  - Renderer: `src/renderer/index.ts` → `dist/renderer/index.js` (IIFE, browser)
  - Preload: `src/preload/index.ts` → `dist/preload/index.js` (CJS, Node platform)
  - CSS: `src/renderer/styles.css` → `dist/renderer/styles.css` (copied)
  - Assets: `assets/` → `dist/assets/` (copied)
- **Packager:** `electron-builder` v24
  - Target: Windows NSIS x64
  - Output: `release/`
  - `asarUnpack`: `dist/main/locker/**`, `node_modules/sharp/**`, `node_modules/@img/**` (native binaries + file I/O)
  - App ID: `com.glow.launcher`

---

## Dependencies

### Runtime

| Package | Purpose |
|---|---|
| `electron` | App shell (v28) |
| `fnbr` | Fortnite API client — XMPP, party, friends, profile MCP |
| `axios` | HTTP client for Epic REST APIs |
| `stanza` | XMPP client (direct XMPP connections) |
| `sharp` | High-performance image processing for locker card generation |
| `node-forge` | TLS/crypto for the MITM proxy certificate chain |
| `koffi` | Native FFI bindings (Oodle decompression, Windows APIs) |
| `discord.js` | Discord Rich Presence (RPC module) |
| `@sapphire/async-queue` | Async serial queue for API call throttling |

### Dev

| Package | Purpose |
|---|---|
| `esbuild` | Fast TypeScript/JS bundler |
| `electron-builder` | Packaging and NSIS installer |
| `typescript` | Type checking |
| `farmhash` | CityHash / FarmHash for asset integrity |
| `@types/node`, `@types/node-forge` | Type definitions |

---

## Tech Stack

- **Shell:** Electron 28 (frameless, `contextIsolation: true`, `nodeIntegration: false`)
- **Language:** TypeScript 5 (strict, compiled via esbuild — no webpack/vite)
- **Styling:** Vanilla CSS with CSS custom properties (`--accent: #00d4ff`, `--bg-base: #08080c`, etc.) — no CSS framework
- **IPC Model:** `contextBridge` + `ipcMain.handle` / `ipcRenderer.invoke` — all async, typed
- **Storage:** Custom `Storage` class — one JSON file per key in `userData/data/`
- **Epic Auth:** Device auth (persisted) with automatic token refresh
- **XMPP:** `fnbr.js` party/friends Client + `stanza` direct sessions for status/autokick
- **Image Gen:** `sharp` — composites cosmetic images into locker card PNGs
- **Proxy:** `node-forge` TLS (self-signed CA) for HTTPS MITM in Auto Responder
- **RPC:** `discord.js` RPC for Discord Rich Presence

---

<div align="center">
Made with ☁️ by STWJXSX
</div>
