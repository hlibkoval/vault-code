# Changelog

All notable changes to Vault Code will be documented in this file.

## [0.1.0] - 2025-01-11

### Added
- MCP (Model Context Protocol) integration for Claude Code IDE protocol
- WebSocket server sends `selection_changed` notifications to Claude Code CLI
- Settings tab with toggle to enable/disable MCP integration
- Selection tracking for both editor and reading view modes

### Changed
- Refactored codebase into modular domain-driven structure (`src/mcp/`, `src/terminal/`, `src/theme/`, `src/view/`)

## [0.0.4] - 2025-01-08

### Changed
- Added scroll position tracking to mitigate terminal jumping to top during Claude Code permission prompts (upstream issue [anthropics/claude-code#826](https://github.com/anthropics/claude-code/issues/826))

## [0.0.3] - 2025-01-08

### Fixed
- Shift+Enter multiline input now works reliably (was inconsistent - sometimes sending, sometimes adding 2 lines)

## [0.0.2] - 2025-01-08

### Fixed
- Terminal text selection now uses Obsidian's accent color for better contrast in light themes

### Changed
- Updated CLAUDE.md with release process documentation

## [0.0.1] - 2025-01-08

Fresh start version after forking from [derek-larson14/obsidian-claude-sidebar](https://github.com/derek-larson14/obsidian-claude-sidebar).

### Added
- Embedded Nerd Font support (Symbols Nerd Font Mono) for terminal icons like git branch, folder, checkmarks
- TypeScript migration with modular source structure in `src/`
- npm/esbuild build toolchain with PTY script embedding plugin
- ESLint configuration with Obsidian-specific rules (`eslint-plugin-obsidianmd`)
- GitHub Actions CI/CD pipeline for automated builds and releases
- CLAUDE.md with comprehensive development documentation

### Changed
- Renamed plugin from "Claude Sidebar" to "Vault Code"
- Plugin ID changed to `vault-code`
- Reorganized repo: build configs in `scripts/`, media in `docs/`
- Simplified installation via curl-based tar.gz bundle from GitHub releases
- Updated attribution to reflect fork maintainer