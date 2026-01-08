# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install     # Install dependencies
npm run dev     # Development mode with file watching
npm run build   # Production build
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

Vault Code is an Obsidian plugin that embeds a terminal running Claude Code in the sidebar.

### Source Structure

```
src/
├── main.ts              # Plugin lifecycle, commands, ribbon icon
├── terminal-view.ts     # ItemView subclass with xterm.js UI
├── terminal-process.ts  # PTY process management
├── xterm-theme.ts       # Theme color extraction
├── xterm-css.ts         # xterm.js CSS injection
└── pty-scripts.ts       # PTY script base64 constants (generated at build)

scripts/
├── terminal_pty.py      # Unix PTY wrapper (Python pty module)
└── terminal_win.py      # Windows PTY wrapper (pywinpty/ConPTY)
```

### Key Components

- **VaultCodePlugin** (`src/main.ts`) - Main plugin class
  - Registers `TerminalView` view type
  - Adds ribbon icon and commands
  - Loads Nerd Font for terminal icons

- **TerminalView** (`src/terminal-view.ts`) - ItemView subclass
  - xterm.js terminal initialization and UI
  - Resize handling with FitAddon
  - Theme sync with Obsidian
  - Escape key scope for terminal passthrough

- **TerminalProcess** (`src/terminal-process.ts`) - PTY management
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

- `Open Claude Code` - Opens or focuses Claude panel
- `New Claude Tab` - Creates additional Claude instance
- `Close Claude Tab` - Closes current Claude tab
- `Toggle Focus: Editor ↔ Claude` - Quick switch between editor and Claude

## Obsidian Plugin Development

Official documentation: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin

### Fetching docs via context7 MCP

The docs site uses dynamic loading, so WebFetch won't work. Use context7 MCP instead:

1. Resolve library ID: `mcp__context7__resolve-library-id` with `libraryName: "obsidian"`
2. Query docs: `mcp__context7__query-docs` with `libraryId: "/websites/obsidian_md"`

Example query topics:
- "Plugin class, onload, onunload lifecycle"
- "ItemView subclass, getViewType, getDisplayText"
- "registerView, addRibbonIcon, addCommand"
- "Workspace, leaf, split pane API"
