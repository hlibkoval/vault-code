# Claude Sidebar

Run [Claude Code](https://claude.com/claude-code) in your Obsidian sidebar.

![Claude Sidebar](screenshot.png)

## Features

- **Embedded terminal** - Full terminal in your Obsidian sidebar
- **Auto-launches Claude** - Claude Code starts automatically
- **Multiple tabs** - Run multiple Claude instances side by side

## Requirements

- macOS or Linux
- Python 3
- [Claude Code](https://claude.com/claude-code)

## Installation

### From Community Plugins (Recommended)

1. Open Obsidian Settings
2. Go to Community Plugins → Browse
3. Search for "Claude Sidebar"
4. Click Install, then Enable

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css`, and `terminal_pty.py` from the [latest release](https://github.com/derek-larson14/obsidian-claude-sidebar/releases)
2. Create folder: `<your-vault>/.obsidian/plugins/claude-sidebar/`
3. Copy the downloaded files into that folder
4. Reload Obsidian and enable the plugin in Settings → Community Plugins

## Usage

- Click the bot icon (🤖) in the left ribbon to open Claude
- Use Command Palette (`Cmd+P`) for:
  - **Open Claude Code** - Open or focus Claude panel
  - **New Claude Tab** - Open additional Claude instance
  - **Close Claude Tab** - Close current Claude tab (when focused)
- Press `Shift+Enter` for multi-line input
- Set your own hotkeys in Settings → Hotkeys

## Platform Support

| Platform | Status |
|----------|--------|
| macOS | ✅ Supported |
| Linux | ✅ Supported |
| Windows | ❌ Not supported |

## How It Works

- [xterm.js](https://xtermjs.org/) for terminal emulation
- Python's built-in `pty` module for pseudo-terminal support

## Contributing

Issues and PRs welcome at [github.com/derek-larson14/obsidian-claude-sidebar](https://github.com/derek-larson14/obsidian-claude-sidebar)

## Author

Built by [Derek Larson](https://dtlarson.com). Want to get more out of Claude Code? See [Delegate with Claude](https://delegatewithclaude.com).

## License

MIT
