# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Command

After modifying the PTY scripts (`terminal_pty.py` or `terminal_win.py`), rebuild the plugin:

```bash
./build.sh
```

This embeds the Python scripts as base64 into `main.js`. There is no TypeScript compilation - `main.js` is the source file bundled with xterm.js.

## Testing Changes

No automated tests. To test manually:
1. Run `./build.sh` after any PTY script changes
2. Copy `main.js`, `manifest.json`, `styles.css`, `symbols-nerd-font.woff2` to a test vault's `.obsidian/plugins/vault-code/`
3. Reload Obsidian (Cmd+R) or disable/re-enable the plugin
4. Open Vault Code panel and verify terminal functionality

## Architecture

Vault Code is an Obsidian plugin that embeds a terminal running Claude Code in the sidebar.

### Key Components

- **main.js** - Bundled plugin code containing:
  - `VaultTerminalPlugin` - Main plugin class registering views and commands
  - `TerminalView` - ItemView subclass managing xterm.js terminal instances
  - Embedded xterm.js library for terminal emulation
  - Base64-encoded PTY scripts (`PTY_SCRIPT_B64`, `WIN_PTY_SCRIPT_B64`)

- **terminal_pty.py** - Unix PTY wrapper using Python's `pty` module. Handles:
  - Forking pseudo-terminal for shell processes
  - Custom resize protocol via escape sequence `\x1b]RESIZE;cols;rows\x07`
  - Bidirectional I/O between xterm.js and the shell

- **terminal_win.py** - Windows equivalent using `pywinpty` (ConPTY). Same resize protocol.

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
