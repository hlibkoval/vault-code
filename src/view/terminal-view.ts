import { ItemView, Scope, WorkspaceLeaf } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getThemeColors } from "../theme/xterm-theme";
import { injectXtermCSS } from "../theme/xterm-css";
import { TerminalProcess, connectTerminalToProcess } from "../terminal/terminal-process";
import { ScrollPositionManager } from "./scroll-position-manager";
import type VaultCodePlugin from "../main";

export const VIEW_TYPE = "vault-terminal";

export class TerminalView extends ItemView {
	private term: Terminal | null = null;
	private fitAddon: FitAddon | null = null;
	private termProcess: TerminalProcess | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private themeObserver: MutationObserver | null = null;
	private termHost: HTMLDivElement | null = null;
	private escapeScope: Scope | null = null;
	private fitTimeout: ReturnType<typeof setTimeout> | null = null;
	private plugin: VaultCodePlugin;
	private scrollManager = new ScrollPositionManager();

	constructor(leaf: WorkspaceLeaf, plugin: VaultCodePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
		return "Claude Code";
	}

	getIcon(): string {
		return "bot";
	}

	async onOpen(): Promise<void> {
		injectXtermCSS();
		this.buildUI();
		this.initTerminal();
		this.startShell();
		this.setupEscapeHandler();
	}

	private setupEscapeHandler(): void {
		// Use Obsidian's Scope API to intercept Escape at keymap level
		// This works above DOM events and can override Obsidian's built-in handlers
		this.escapeScope = new Scope(this.app.scope);
		this.escapeScope.register([], "Escape", () => {
			// Only intercept when terminal has focus
			if (this.containerEl.contains(document.activeElement)) {
				this.termProcess?.write("\x1b");
				return false; // Block further handling by Obsidian
			}
			return true; // Let Obsidian handle it normally
		});
		this.app.keymap.pushScope(this.escapeScope);
	}

	async onClose(): Promise<void> {
		this.dispose();
	}

	private buildUI(): void {
		const container = this.containerEl;
		container.empty();
		container.addClass("vault-terminal");
		this.termHost = container.createDiv({ cls: "vault-terminal-host" });
	}

	private initTerminal(): void {
		if (!this.termHost) return;

		this.term = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily:
				"Menlo, Monaco, 'Cascadia Mono', 'Cascadia Code', Consolas, 'Courier New', 'Symbols Nerd Font Mono', monospace",
			theme: getThemeColors(),
			scrollback: 10000,
		});

		this.fitAddon = new FitAddon();
		this.term.loadAddon(this.fitAddon);
		this.term.open(this.termHost);

		// Suppress focus report sequences
		this.term.parser?.registerCsiHandler({ final: "I" }, () => true);
		this.term.parser?.registerCsiHandler({ final: "O" }, () => true);

		// Custom key handlers
		this.term.attachCustomKeyEventHandler((ev) => {
			// Shift+Enter: send Alt+Enter for multi-line input in Claude Code
			// Must handle BOTH keydown and keyup to fully block the event
			if (ev.shiftKey && ev.key === "Enter") {
				if (ev.type === "keydown") {
					this.termProcess?.write("\x1b\r");
				}
				// Prevent propagation to Obsidian's hotkey system
				ev.preventDefault();
				ev.stopPropagation();
				return false;
			}

			if (ev.type === "keydown") {
				// Cmd+Arrow: readline shortcuts for line navigation
				if (ev.metaKey) {
					if (ev.key === "ArrowRight") {
						this.termProcess?.write("\x05"); // Ctrl+E = end of line
						return false;
					}
					if (ev.key === "ArrowLeft") {
						this.termProcess?.write("\x01"); // Ctrl+A = start of line
						return false;
					}
				}
			}
			return true;
		});

		void this.waitForHostReady().then(() => {
			this.fit();
			setTimeout(() => this.fit(), 50);
		});

		this.resizeObserver = new ResizeObserver(() => this.debouncedFit());
		this.resizeObserver.observe(this.termHost);

		// Watch for theme changes
		this.themeObserver = new MutationObserver(() => this.updateTheme());
		this.themeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});

		// Watch for Obsidian layout changes (sidebar resize, etc.)
		this.registerEvent(this.app.workspace.on("layout-change", () => this.debouncedFit()));

		// Mitigate Ink TUI scroll-to-top bug (Claude Code issue #826)
		this.scrollManager.attach(this.term);
	}

	private updateTheme(): void {
		if (!this.term) return;
		const newTheme = getThemeColors();
		const cur = this.term.options.theme;
		// Only update if theme actually changed
		if (
			cur?.background !== newTheme.background ||
			cur?.foreground !== newTheme.foreground ||
			cur?.selectionBackground !== newTheme.selectionBackground
		) {
			this.term.options.theme = newTheme;
		}
	}

	private fit(): void {
		if (!this.term || !this.fitAddon) return;
		try {
			this.fitAddon.fit();
		} catch {
			// Ignore fit errors
		}
	}

	private debouncedFit(): void {
		if (this.fitTimeout) clearTimeout(this.fitTimeout);
		this.fitTimeout = setTimeout(() => {
			this.fit();
			this.fitTimeout = null;
		}, 100);
	}

	private async waitForHostReady(): Promise<boolean> {
		if (!this.fitAddon) return false;
		for (let i = 0; i < 10; i++) {
			const dim = this.fitAddon.proposeDimensions();
			if (dim && dim.cols > 0 && dim.rows > 0) {
				return true;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		return false;
	}

	private startShell(): void {
		if (!this.term) return;

		this.termProcess = new TerminalProcess();

		const cwd = this.plugin.getVaultPath();
		const cols = this.term.cols || 80;
		const rows = this.term.rows || 24;

		connectTerminalToProcess(this.term, this.termProcess);

		this.termProcess.start({
			cwd,
			cols,
			rows,
			useIdeFlag: this.plugin.settings.mcpEnabled,
			onData: (data) => {
				this.term?.write(data);
			},
			onExit: (code, signal) => {
				if (this.termProcess?.platform === "win32" && code === 9009) {
					this.term?.writeln("\r\n[Python not found]");
					this.term?.writeln("Install Python: winget install Python.Python.3");
					this.term?.writeln("Or download from: https://python.org");
				} else {
					this.term?.writeln(`\r\n[Process exited: ${code ?? signal}]`);
				}
			},
			onError: (err) => {
				if (this.termProcess?.platform === "win32" && err.message.includes("ENOENT")) {
					this.term?.writeln("\r\n[Python not found]");
					this.term?.writeln("Install Python: winget install Python.Python.3");
					this.term?.writeln("Or download from: https://python.org");
				} else {
					this.term?.writeln(`\r\n[Error: ${err.message}]`);
				}
			},
		});

		this.term.focus();
	}

	private dispose(): void {
		this.resizeObserver?.disconnect();
		this.themeObserver?.disconnect();

		if (this.fitTimeout) {
			clearTimeout(this.fitTimeout);
			this.fitTimeout = null;
		}

		this.scrollManager.dispose();

		if (this.escapeScope) {
			this.app.keymap.popScope(this.escapeScope);
			this.escapeScope = null;
		}

		this.termProcess?.stop();
		this.termProcess = null;

		this.term?.dispose();
		this.term = null;
		this.fitAddon = null;
	}

	focusTerminal(): void {
		this.term?.focus();
	}
}
