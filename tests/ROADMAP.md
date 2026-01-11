# Test Coverage Roadmap

This document tracks the test implementation progress for vault-code.

## Overview

- **Framework:** Vitest with happy-dom
- **Coverage target:** 90%+ on tested modules
- **CI:** Tests required to pass before merge

## Phase 0: Infrastructure ✅

Setup test framework and tooling.

- [x] Add vitest, @vitest/coverage-v8, happy-dom dependencies
- [x] Create `vitest.config.ts` with coverage thresholds
- [x] Create `tests/` directory structure (separate from `src/`)
- [x] Create `tests/setup.ts` for global test setup
- [x] Create `tests/mocks/obsidian-module.ts` - mock obsidian package
- [x] Create `tests/mocks/obsidian.ts` - mock factories (Editor, TFile, etc.)
- [x] Create `tests/mocks/dom.ts` - DOM helpers for happy-dom
- [x] Add test scripts to `package.json` (test, test:watch, test:coverage)
- [x] Add test step to CI workflow (`.github/workflows/ci.yml`)
- [x] Update `tsconfig.json` to exclude tests from build
- [x] Update ESLint config to exclude tests directory

## Phase 1: P0 - Pure Functions ✅

Test pure functions with high impact and easy testability.

### mcp-notifications.ts (20 tests)
- [x] `createCursorPosition` - basic, zero values, large values
- [x] `createCodeRange` - basic, single-line, zero-length
- [x] `createSelectionChangedNotification` - valid, null selection, null filePath, empty text, multiline
- [x] `createAtMentionedNotification` - valid, null lines, single line, partial nulls
- [x] `toFileUri` - normal, empty vault, spaces, nested paths

### xterm-theme.ts (15 tests)
- [x] `hexToRgba` - 6-digit hex, no prefix, lowercase, uppercase, rgb passthrough, rgba passthrough, invalid, short hex, empty, zero alpha, full alpha
- [x] `getThemeColors` - required properties, extract colors, fallbacks, rgb passthrough
- [x] Export `hexToRgba` for direct testing

### mcp-lock-file.ts (19 tests)
- [x] `generateAuthToken` - base64url format, length, uniqueness
- [x] `findAvailablePort` - valid port, ephemeral range
- [x] `createLockFile` - content structure, JSON validity, directory creation, CLAUDE_CONFIG_DIR env, default path
- [x] `deleteLockFile` - exists, not exists, error handling
- [x] `cleanupStaleLockFiles` - matching vault, other vaults, non-.lock files, missing directory, invalid JSON, missing workspaceFolders

## Phase 2: P1 - Medium Effort ✅

Test modules requiring mocks but with moderate complexity.

### editor-selection-strategy.ts (10 tests)
- [x] `extractSelection` - no selection, empty listSelections, single-line, multi-line, reversed direction, line 0, zero offset
- [x] `getSelectedText` - basic, empty, multiline

### scroll-position-manager.ts (13 tests)
- [x] `attach` - registers handler
- [x] Scroll behavior - stable tracking, jump-to-top restore, below threshold, equals threshold, exceeds threshold, debounce, lock window, resume after lock, position 0 handling
- [x] `dispose` - clears timeout, safe multiple calls, safe before attach

### preview-selection-strategy.ts (11 tests)
- [x] `extractSelection` - no selection, collapsed, outside container, with markers, no markers, parent markers, partial markers, line 0
- [x] `getSelectedText` - basic, empty, outside container

## Phase 3: P2 - Integration Tests (Partial) ✅

Complex modules requiring significant mocking or real dependencies.

### ws-frames.ts (36 tests) ✅ NEW

Extracted WebSocket frame utilities for direct unit testing.

- [x] `parseFrames` - small/medium/large payloads, masked/unmasked, incomplete frames, multiple frames
- [x] `createFrame` - small/medium/large payloads, all opcodes, round-trip validation
- [x] `createCloseFrame` - codes, reasons, UTF-8 handling
- [x] Constants - opcodes, WebSocket GUID

### mcp-server.ts (32 tests) ✅

WebSocket MCP server with real WebSocket client testing.

- [x] Server lifecycle - start, stop, lock file creation/deletion, restart
- [x] WebSocket handshake - valid auth, invalid auth, wrong protocol, invalid path
- [x] MCP protocol - initialize, tools/list, resources/list, prompts/list, ping
- [x] Notifications - sendNotification, broadcast to multiple clients
- [x] Client management - connect, disconnect, multiple clients
- [x] Keepalive - ping/pong mechanism
- [x] Server shutdown - graceful close with active connections

### terminal-process.ts ⛔ DEFERRED

- [ ] Process startup (Unix vs Windows)
- [ ] Stdin/stdout piping with StringDecoder
- [ ] UTF-8 boundary handling
- [ ] Resize sequence encoding/transmission
- [ ] Process termination and cleanup
- [ ] Platform detection

**Note:** terminal-process.ts cannot be unit tested because:
- Node.js built-in modules (child_process, fs, os) have non-configurable properties
- vi.mock and vi.spyOn cannot override spawn/execSync
- Requires integration testing with real Python PTY scripts

## Phase 4: P3 - Integration/E2E (Partial) ✅

Modules tightly coupled to Obsidian or requiring complex setup.

### selection-tracker.ts (21 tests) ✅
- [x] Constructor initialization
- [x] start/stop polling lifecycle (500ms interval)
- [x] Polling with hasConnectedClients check
- [x] View mode detection (editor vs preview strategy)
- [x] Selection change deduplication (same file+selection)
- [x] notifySelectionChanged immediate and delayed modes
- [x] Skip when no active MarkdownView or no file

### mcp-integration.ts (17 tests) ✅
- [x] Constructor and initialization
- [x] start() - cleanup stale locks, create MCPServer, delegate start
- [x] start() - error handling (logs but doesn't throw)
- [x] start() - empty vaultPath early return
- [x] stop() - delegate to server, null safety, idempotent
- [x] sendNotification() - delegate to server, null safety
- [x] hasConnectedClients() - delegate to server, return false when null

### terminal-view.ts ⛔ DEFERRED
- [ ] Terminal initialization (FitAddon, theme colors)
- [ ] Key handling (Escape, Shift+Enter, Cmd+Arrow)
- [ ] Theme change observation
- [ ] Resize observation and debouncing
- [ ] Focus scope management
- [ ] Cleanup/disposal

**Note:** terminal-view.ts deferred due to xterm.js complexity and DOM requirements.

### view-manager.ts (16 tests) ✅
- [x] toggleFocus() - switch between editor and Claude terminal
- [x] toggleFocus() - no leaves, TerminalView leaf, non-TerminalView leaf
- [x] focusTerminal() - focus first TerminalView leaf
- [x] focusTerminal() - no leaves, no TerminalView leaves
- [x] activateView() - show existing or create new Claude view
- [x] activateView() - existing leaf, no existing leaf
- [x] createNewTab() - create terminal in right sidebar
- [x] createNewTab() - null sidebar handling

## Excluded from Testing

These modules are explicitly excluded from test coverage:

| Module | Reason |
|--------|--------|
| `src/main.ts` | Plugin lifecycle, integration scope |
| `src/settings.ts` | Settings UI, integration scope |
| `src/terminal/**` | PTY requires real Node child processes |
| `src/resources/**` | Font loading, browser-only |
| `src/mcp/mcp-types.ts` | Type definitions only |
| `src/theme/xterm-css.ts` | CSS injection, runtime only |
| `src/interfaces/**` | Interface definitions only |

## Current Status

| Metric | Value |
|--------|-------|
| Test Files | 11 |
| Tests | 210 |
| Statements | 92.04% |
| Branches | 92.36% |
| Functions | 98.43% |
| Lines | 92.04% |

### Coverage by Module

| Module | Coverage |
|--------|----------|
| ws-frames.ts | 100% |
| mcp-notifications.ts | 100% |
| mcp-lock-file.ts | 96.47% |
| mcp-server.ts | 84.52% |
| mcp-integration.ts | 100% |
| selection-tracker.ts | 97.77% |
| xterm-theme.ts | 100% |
| scroll-position-manager.ts | 100% |
| editor-selection-strategy.ts | 100% |
| preview-selection-strategy.ts | 97.67% |
| view-manager.ts | 100% |

## Running Tests

```bash
# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```
