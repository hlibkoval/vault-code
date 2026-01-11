import {Editor, Plugin, TAbstractFile, TFile} from "obsidian";
import {TerminalView, VIEW_TYPE} from "./view/terminal-view";
import {ViewManager} from "./view/view-manager";
import {MCPIntegration} from "./mcp/mcp-integration";
import {SelectionTracker} from "./mcp/selection";
import {createAtMentionedNotification} from "./mcp/mcp-notifications";
import {loadNerdFont, unloadNerdFont} from "./resources/font-loader";
import {IVaultContext} from "./interfaces";
import {registerLineMarkerProcessor} from "./mcp/line-marker-processor";
import {DEFAULT_SETTINGS, VaultCodeSettingTab, VaultCodeSettings} from "./settings";

export default class VaultCodePlugin extends Plugin implements IVaultContext {
	settings!: VaultCodeSettings;
	private mcpIntegration: MCPIntegration | null = null;
	private viewManager!: ViewManager;
	private selectionTracker: SelectionTracker | null = null;

	async onload(): Promise<void> {
		// Load settings first
		await this.loadSettings();
		this.addSettingTab(new VaultCodeSettingTab(this.app, this));

		const basePath = (this.app.vault.adapter as { basePath?: string })?.basePath;
		await loadNerdFont(this.manifest?.dir, basePath);

		this.registerView(VIEW_TYPE, (leaf) => new TerminalView(leaf, this));
		this.viewManager = new ViewManager(this.app.workspace);

		// Register line marker processor (checks enabled flag internally)
		registerLineMarkerProcessor(this, () => this.settings.mcpEnabled);

		// Gate MCP initialization
		if (this.settings.mcpEnabled) {
			console.debug("[Vault Code] MCP integration enabled, starting server");
			await this.startMCPServer();
		} else {
			console.debug("[Vault Code] MCP integration disabled");
		}

		// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
		this.addRibbonIcon("bot", "Open Claude Code", () => void this.viewManager.activateView());

		this.addCommand({
			id: "open-claude",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Open Claude code",
			callback: () => void this.viewManager.activateView(),
		});

		this.addCommand({
			id: "new-claude-tab",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "New Claude tab",
			callback: () => void this.viewManager.createNewTab(),
		});

		this.addCommand({
			id: "close-claude-tab",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Close Claude tab",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(TerminalView);
				if (view) {
					if (!checking) view.leaf.detach();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "toggle-claude-focus",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Toggle focus: Editor ↔ Claude",
			callback: () => void this.viewManager.toggleFocus(),
		});

		this.addCommand({
			id: "send-to-claude",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Send to Claude Code",
			editorCallback: (editor, ctx) => this.sendToClaudeCode(editor, ctx.file),
		});

		// Context menu: Send file to Claude Code (only when MCP enabled)
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!this.settings.mcpEnabled) return;
				menu.addItem((item) => {
					item
						// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
						.setTitle("Send to Claude Code")
						.setIcon("bot")
						.onClick(() => {
							this.sendFileToClaudeCode(file);
						});
				});
			})
		);

		// Context menu: Send selection to Claude Code (only when MCP enabled)
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				if (!this.settings.mcpEnabled) return;
				menu.addItem((item) => {
					item
						// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
						.setTitle("Send to Claude Code")
						.setIcon("bot")
						.onClick(() => {
							this.sendToClaudeCode(editor, view.file);
						});
				});
			})
		);

		// Start selection tracking (only if MCP is enabled)
		if (this.settings.mcpEnabled) {
			this.startSelectionTracking();
		}
	}

	onunload(): void {
		// Stop selection tracking
		this.selectionTracker?.stop();
		this.selectionTracker = null;

		// Stop MCP server
		this.mcpIntegration?.stop();
		this.mcpIntegration = null;

		// Remove injected font style
		unloadNerdFont();
	}

	/**
	 * Start the MCP server for Claude Code integration.
	 */
	private async startMCPServer(): Promise<void> {
		const vaultPath = this.getVaultPath();
		if (!vaultPath) {
			return;
		}

		this.mcpIntegration = new MCPIntegration({
			vaultPath,
			onInitialized: () => {
				// Notify selection tracker when MCP is initialized
				this.selectionTracker?.notifySelectionChanged();
			},
		});

		await this.mcpIntegration.start();
	}

	/**
	 * Start tracking selection changes.
	 */
	private startSelectionTracking(): void {
		if (!this.mcpIntegration) {
			return;
		}

		this.selectionTracker = new SelectionTracker({
			app: this.app,
			vaultContext: this,
			notificationSender: this.mcpIntegration,
		});

		this.selectionTracker.start();

		// Register cleanup
		this.register(() => {
			this.selectionTracker?.stop();
		});
	}

	getVaultPath(): string {
		const adapter = this.app.vault.adapter as { basePath?: string };
		return adapter.basePath || "";
	}

	/**
	 * Format file path for Claude Code - wrap in quotes if contains spaces.
	 */
	private formatFilePath(path: string): string {
		return path.includes(" ") ? `'${path}'` : path;
	}

	/**
	 * Send selected text to Claude Code via @-mention notification.
	 */
	private sendToClaudeCode(editor: Editor, file: TFile | null): void {
		if (!this.mcpIntegration || !file) {
			return;
		}

		const selection = editor.listSelections()[0];
		if (!selection) {
			return;
		}

		const startLine = Math.min(selection.anchor.line, selection.head.line);
		const endLine = Math.max(selection.anchor.line, selection.head.line);

		this.mcpIntegration.sendNotification(
			createAtMentionedNotification(this.formatFilePath(file.path), startLine, endLine)
		);

		this.viewManager.focusTerminal();
	}

	/**
	 * Send entire file to Claude Code via @-mention notification.
	 */
	private sendFileToClaudeCode(file: TAbstractFile): void {
		if (!this.mcpIntegration || !(file instanceof TFile)) {
			return;
		}

		this.mcpIntegration.sendNotification(
			createAtMentionedNotification(this.formatFilePath(file.path), null, null)
		);

		this.viewManager.focusTerminal();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<VaultCodeSettings>);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Apply MCP setting change at runtime.
	 */
	async applyMcpSetting(enabled: boolean): Promise<void> {
		if (enabled) {
			if (!this.mcpIntegration) {
				console.debug("[Vault Code] Starting MCP integration");
				await this.startMCPServer();
				this.startSelectionTracking();
			}
		} else {
			console.debug("[Vault Code] Stopping MCP integration");
			this.selectionTracker?.stop();
			this.selectionTracker = null;
			this.mcpIntegration?.stop();
			this.mcpIntegration = null;
		}
	}
}
