# GomizPlayer IPTV

A neutral Electron desktop media player for IPTV/VOD playlists you already own.  
GomizPlayer IPTV does **not** include any channels, movies, series, streams, accounts, or subscriptions.

- **Platform:** Windows (Electron)
- **Stack:** Electron (main/preload/renderer), HLS.js, mpegts.js, FFmpeg (recording)
- **UI languages:** Arabic (RTL) and English
- **Content sources:** Local/remote M3U/M3U8 playlists and Xtream Codes portals (user-provided)

> Use this application only with content and services you have the rights to access.

## Features

- **Sources:** M3U/M3U8 (local file or URL) and Xtream Codes portals.
- **Content types:** Live TV, Movies, and Series with category/group browsing.
- **EPG:** XMLTV guide support (URL or local file, including `.gz` where supported).
- **Playback:** HLS, MPEG-TS, and supported local/native media formats (engine depends on source/format).
- **Player:** Playback controls, quality/track options (where available), subtitles (SRT/VTT/ASS), PiP/fullscreen, stats, and player-side browsing tools.
- **Library:** Favorites, continue watching/watch history, search history, per-profile local data.
- **Downloads & recordings:** Download management (pause/resume/recovery where supported) and FFmpeg-based live recording with an in-app recordings view.
- **Customization:** Themes, Arabic/English UI with RTL support, and home/layout personalization options.

## Repository layout

```text
.
├─ Start-GomizPlayer.cmd      # Windows launcher (installs deps if needed, then starts app)
├─ package.json               # App metadata, scripts, dependencies, build config
├─ scripts/
│  └─ copy-vendor.js          # Copies renderer media vendor files (postinstall)
├─ src/
│  ├─ main/                   # Electron main process, IPC, parsing, storage, network, security
│  ├─ preload/                # (if present) preload bridge
│  ├─ renderer/               # UI (HTML/CSS/JS), player, i18n, subtitles
│  └─ shared/                 # Shared logic (e.g. centralized media classification)
├─ sample/
│  └─ demo.m3u                # Demo playlist (no bundled commercial content)
├─ tools/                     # Test and utility scripts
└─ docs/                      # Notes/manual test plans (project docs)
```

> Note: Some folders/files may evolve; `package.json` scripts and `src/` are the source of truth.

## Requirements

- **Node.js + npm** (LTS recommended)
- **Windows** recommended for packaged builds and the provided launcher script
- Internet access only as needed for your own remote playlists/EPG/services

## Installation

```powershell
git clone https://github.com/radhouanemokranecontact-tech/GomizPlayer-IPTV.git
cd GomizPlayer-IPTV
npm install
```

`npm install` runs `postinstall` (`node scripts/copy-vendor.js`) to prepare required renderer vendor assets.

## Run (development)

### Windows (easy)
- Double-click `Start-GomizPlayer.cmd` in the repository root.

### Command line
```powershell
npm start
```

Developer-oriented run (same Electron entry in current scripts):

```powershell
npm run dev
```

## Build (Windows)

Configured via `electron-builder` in `package.json`.

```powershell
# Unpacked directory build
npm run pack

# Windows distributables (NSIS + portable, per build config)
npm run dist
```

Build artifacts are written to `dist/` (generated output; do not commit).

> Update/code-signing configuration may require additional environment/setup before publishing signed releases.

## Testing & checks

Available npm scripts (see `package.json`):

```powershell
# SSRF / network safety checks
npm run test:ssrf

# Content classification tests (Live/Movie/Series, Xtream, AR/FR/EN, metadata edge cases, demo regressions)
npm run test:classification

# Secrets/credential storage regression tests (runs in Electron)
npm run test:secrets
```

Additional/manual checks:
- Start the app: `npm start`
- Parse/sample validation: load `sample/demo.m3u` from the app
- Build verification: `npm run pack` (and `npm run dist` when environment is ready)

If a test cannot run in your environment (e.g. missing Electron runtime/build prerequisites), run the available tests and report the blocker explicitly.

## Security & privacy

- **No bundled content:** the app only plays sources you add.
- **Credential handling:** Xtream/source credentials are handled by the main process and should be stored using secure OS-backed encryption when available. If secure storage is unavailable, the app must not silently persist new credentials in plaintext and should inform you.
- **Backups:** Backup/export can exclude credentials by default. If you choose to include credentials, passwords are exported in plaintext inside the backup file (user-confirmed)—store it securely and delete it when no longer needed. Backups that keep encrypted credentials (`passwordEnc`/`passwordEncV`) are primarily intended for restore on the same device/user context; OS-backed encryption (e.g. Windows DPAPI via Electron safeStorage) is device/user-bound, so restoring encrypted credentials on another device may fail to decrypt and you may need to re-enter credentials. Restoring a backup does not overwrite unrelated data outside the imported backup scope.
- **Network access:** the app connects to playlist/EPG/stream endpoints you configure and to services required by enabled features (e.g. updates, widgets) as implemented.
- **Telemetry/privacy:** telemetry/diagnostics (if present) should respect user consent/settings. Review in-app settings and repository privacy documentation for current behavior.
- **Responsible use:** you are responsible for legal compliance and for protecting your accounts, playlists, and local network.

## Local data

User data is stored in the Electron user data directory (on Windows typically under `%APPDATA%\\gomizplayer-iptv`), including settings, library data, caches, downloads, and recordings (paths may be configurable).

## Legal

GomizPlayer IPTV is a neutral media player. It ships with no channels, movies, or streams.  
You are responsible for the rights to any content you access and for complying with applicable laws and provider terms.

## License

MIT (see `LICENSE`).
