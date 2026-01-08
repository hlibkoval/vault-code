# Changelog

All notable changes to Vault Code will be documented in this file.

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