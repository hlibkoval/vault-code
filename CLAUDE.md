# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vault Code is an Obsidian plugin that embeds a terminal running Claude Code in the sidebar.

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript)
- Entry point: `src/main.ts` compiled to `main.js`
- Required release artifacts: `main.js`, `manifest.json`, `styles.css`, `symbols-nerd-font.woff2`
- Desktop only: Uses Node.js child processes for PTY management

## Environment & Tooling

- Node.js: use current LTS (Node 18+ recommended)
- **Package manager: npm** - `package.json` defines npm scripts and dependencies
- **Bundler: esbuild** - `scripts/esbuild.config.mjs` handles bundling with custom PTY embedding plugin
- Types: `obsidian` type definitions

## Build Commands

```bash
npm install     # Install dependencies
npm run dev     # Development mode with file watching
npm run build   # Production build (TypeScript check + esbuild)
npm run lint    # Run ESLint
```

The build process:
1. TypeScript files in `src/` are compiled and bundled by esbuild
2. PTY scripts (`scripts/terminal_pty.py`, `scripts/terminal_win.py`) are embedded as base64 via custom esbuild plugin
3. Output is `main.js` at the project root

## Testing Changes

No automated tests. To test manually:
1. Run `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css`, `symbols-nerd-font.woff2` to a test vault's `.obsidian/plugins/vault-code/`
3. Reload Obsidian (Cmd+R) or disable/re-enable the plugin
4. Open Vault Code panel and verify terminal functionality

## Architecture

### Source Structure

```
src/
├── main.ts                    # Plugin lifecycle, commands, ribbon icon
├── settings.ts                # Settings interface and settings tab
├── interfaces/                # Shared interfaces
│   ├── index.ts
│   ├── notification-sender.ts # MCP notification sender interface
│   └── vault-context.ts       # Vault context provider interface
├── mcp/                       # MCP (Model Context Protocol) integration
│   ├── mcp-server.ts          # WebSocket MCP server
│   ├── mcp-integration.ts     # Facade coordinating MCP components
│   ├── mcp-lock-file.ts       # Lock file management for discovery
│   ├── mcp-notifications.ts   # Notification sender implementation
│   ├── mcp-types.ts           # MCP protocol type definitions
│   ├── line-marker-processor.ts # DOM line marker extraction
│   └── selection/             # Selection tracking subsystem
│       ├── index.ts
│       ├── selection-tracker.ts      # Main tracker with polling
│       ├── selection-strategy.ts     # Strategy interface
│       ├── editor-selection-strategy.ts  # Markdown editor selection
│       └── preview-selection-strategy.ts # Reading view selection
├── terminal/
│   ├── terminal-process.ts    # PTY process management
│   └── pty-scripts.ts         # PTY script base64 constants (generated)
├── theme/
│   ├── xterm-theme.ts         # Theme color extraction
│   └── xterm-css.ts           # xterm.js CSS injection
├── view/
│   ├── terminal-view.ts       # ItemView subclass with xterm.js UI
│   ├── view-manager.ts        # View lifecycle management
│   └── scroll-position-manager.ts # Scroll position tracking
└── resources/
    └── font-loader.ts         # Nerd Font loading

scripts/
├── esbuild.config.mjs   # Build configuration with PTY embedding
├── eslint.config.mts    # ESLint rules for Obsidian plugins
├── version-bump.mjs     # Version sync script
├── terminal_pty.py      # Unix PTY wrapper (Python pty module)
└── terminal_win.py      # Windows PTY wrapper (pywinpty/ConPTY)
```

### Key Components

- **VaultCodePlugin** (`src/main.ts`) - Main plugin class
  - Registers `TerminalView` view type
  - Adds ribbon icon and commands
  - Initializes MCP integration and settings

- **Settings** (`src/settings.ts`) - Plugin configuration
  - Settings interface with MCP toggle
  - Settings tab UI with reconnection hints

- **MCP Integration** (`src/mcp/`) - Claude Code IDE protocol
  - WebSocket server implementing MCP over JSON-RPC 2.0
  - Lock file creation for service discovery
  - Selection tracking with strategy pattern (editor/preview modes)
  - Sends `selection_changed` notifications to Claude Code CLI

- **TerminalView** (`src/view/terminal-view.ts`) - ItemView subclass
  - xterm.js terminal initialization and UI
  - Resize handling with FitAddon
  - Theme sync with Obsidian
  - Escape key scope for terminal passthrough

- **TerminalProcess** (`src/terminal/terminal-process.ts`) - PTY management
  - Spawns Python PTY wrapper as child process
  - Handles stdin/stdout with proper UTF-8 decoding
  - Resize protocol via escape sequence `\x1b]RESIZE;cols;rows\x07`

- **PTY Scripts** (`scripts/`) - Python wrappers
  - Unix: Uses Python's `pty` module for pseudo-terminal
  - Windows: Uses `pywinpty` (ConPTY)
  - Auto-launches `claude` command on shell start

### Data Flow

1. Plugin spawns Python PTY script as child process
2. PTY script forks shell and runs `claude || true; exec $SHELL -i` (Unix) or sends `claude\r` after delay (Windows)
3. xterm.js ↔ Python PTY ↔ Shell/Claude bidirectional communication via stdin/stdout pipes
4. Resize events sent as escape sequences, parsed and applied by PTY script

### Plugin Commands

- `Open Claude code` - Opens or focuses Claude panel
- `New Claude tab` - Creates additional Claude instance
- `Close Claude tab` - Closes current Claude tab
- `Toggle focus: Editor ↔ Claude` - Quick switch between editor and Claude

## Linting

- ESLint config is at `scripts/eslint.config.mts`
- Run with: `npm run lint`
- Uses `eslint-plugin-obsidianmd` for Obsidian-specific rules

## File & Folder Conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands)
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages
- Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`)

## Manifest Rules (`manifest.json`)

- Must include:
  - `id` (plugin ID; for local dev it should match the folder name)
  - `name`
  - `version` (Semantic Versioning `x.y.z`)
  - `minAppVersion`
  - `description`
  - `isDesktopOnly` (boolean) - `true` for this plugin
  - Optional: `author`, `authorUrl`, `fundingUrl`
- Never change `id` after release. Treat it as stable API
- Keep `minAppVersion` accurate when using newer APIs
- Canonical requirements: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Commands & Settings

- Any user-facing commands should be added via `this.addCommand(...)`
- If the plugin has configuration, provide a settings tab and sensible defaults
- Persist settings using `this.loadData()` / `this.saveData()`
- Use stable command IDs; avoid renaming once released

## Versioning & Releases

This project uses [Semantic Versioning](https://semver.org/) (semver). Releases are automated via GitHub Actions, triggered by changes to `CHANGELOG.md`.

### Release Process

1. **Update version** in all three files (must match):
   - `manifest.json` - plugin metadata
   - `package.json` - npm package version
   - `versions.json` - map plugin version → minimum Obsidian version

2. **Add changelog entry** in `CHANGELOG.md`:
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD

   ### Added
   - New feature description

   ### Changed
   - Change description

   ### Fixed
   - Bug fix description
   ```

3. **Push to main** - the release workflow automatically:
   - Extracts version from first `## [X.Y.Z]` header in CHANGELOG.md
   - Verifies version consistency across manifest.json, package.json, and CHANGELOG.md
   - Builds the plugin
   - Creates a git tag `vX.Y.Z`
   - Creates a GitHub release with bundle files from `package.json` → `obsidian.bundleFiles`

### Version Script

Use `npm run version` to bump versions consistently:
```bash
npm run version  # prompts for new version, updates manifest.json, package.json, versions.json
```

### Notes

- Tags use `v` prefix (e.g., `v0.0.1`) per GitHub convention
- Bundle files are defined in `package.json` under `obsidian.bundleFiles`
- Workflow skips if release for that version already exists

## Security, Privacy, and Compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault
- Clearly disclose any external services used, data sent, and risks
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented
- Avoid deceptive patterns, ads, or spammy notifications
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely

## UX & Copy Guidelines

- Prefer sentence case for headings, buttons, and titles
- Use clear, action-oriented imperatives in step-by-step copy
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions
- Use arrow notation for navigation: **Settings → Community plugins**
- Keep in-app strings short, consistent, and free of jargon

## Performance

- Keep startup light. Defer heavy work until needed
- Avoid long-running tasks during `onload`; use lazy initialization
- Batch disk access and avoid excessive vault scans
- Debounce/throttle expensive operations in response to file system events

## Coding Conventions

- TypeScript with `"strict": true` preferred
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility
- Bundle everything into `main.js` (no unbundled runtime deps)
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly
- Prefer `async/await` over promise chains; handle errors gracefully

## Mobile

- This plugin is desktop-only (`isDesktopOnly: true`) due to PTY/terminal requirements
- For other plugins: test on iOS and Android where feasible
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`
- Avoid large in-memory structures; be mindful of memory and storage constraints

## Agent Do/Don't

**Do**
- Add commands with stable IDs (don't rename once released)
- Provide defaults and validation in settings
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals
- Use `this.register*` helpers for everything that needs cleanup

**Don't**
- Introduce network calls without an obvious user-facing reason and documentation
- Ship features that require cloud services without clear disclosure and explicit opt-in
- Store or transmit vault contents unless essential and consented

## Common Tasks

### Organize Code Across Multiple Files

**main.ts** (minimal, lifecycle only):
```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
  settings: MySettings;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    registerCommands(this);
  }
}
```

**settings.ts**:
```ts
export interface MySettings {
  enabled: boolean;
  apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
  enabled: true,
  apiKey: "",
};
```

**commands/index.ts**:
```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
  plugin.addCommand({
    id: "do-something",
    name: "Do something",
    callback: () => doSomething(plugin),
  });
}
```

### Add a Command

```ts
this.addCommand({
  id: "your-command-id",
  name: "Do the thing",
  callback: () => this.doTheThing(),
});
```

### Persist Settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### Register Listeners Safely

```ts
this.registerEvent(this.app.workspace.on("file-open", f => { /* ... */ }));
this.registerDomEvent(window, "resize", () => { /* ... */ });
this.registerInterval(window.setInterval(() => { /* ... */ }, 1000));
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust

## Fetching Obsidian Docs

The docs site uses dynamic loading, so WebFetch won't work. Use context7 MCP instead:

1. Resolve library ID: `mcp__context7__resolve-library-id` with `libraryName: "obsidian"`
2. Query docs: `mcp__context7__query-docs` with `libraryId: "/websites/obsidian_md"`

Example query topics:
- "Plugin class, onload, onunload lifecycle"
- "ItemView subclass, getViewType, getDisplayText"
- "registerView, addRibbonIcon, addCommand"
- "Workspace, leaf, split pane API"

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide