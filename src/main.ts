import {Editor, Plugin, TFile} from "obsidian";
import {TerminalView, VIEW_TYPE} from "./view/terminal-view";
import {ViewManager} from "./view/view-manager";
import {MCPIntegration} from "./mcp/mcp-integration";
import {SelectionTracker} from "./selection";
import {createAtMentionedNotification} from "./mcp/mcp-notifications";
import {toFileUri} from "./utils/uri-utils";
import {loadNerdFont, unloadNerdFont} from "./resources/font-loader";
import {IVaultContext} from "./interfaces";
import {registerLineMarkerProcessor} from "./markdown/line-marker-processor";

export default class VaultCodePlugin extends Plugin implements IVaultContext {
	private mcpIntegration: MCPIntegration | null = null;
	private viewManager!: ViewManager;
	private selectionTracker: SelectionTracker | null = null;

	async onload(): Promise<void> {
		const basePath = (this.app.vault.adapter as { basePath?: string })?.basePath;
		await loadNerdFont(this.manifest?.dir, basePath);
		await this.startMCPServer();

		this.registerView(VIEW_TYPE, (leaf) => new TerminalView(leaf, this));
		this.viewManager = new ViewManager(this.app.workspace);
		registerLineMarkerProcessor(this);

		// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
		this.addRibbonIcon("bot", "Open Claude", () => void this.viewManager.activateView());

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

		// Start selection tracking
		this.startSelectionTracking();
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
		const fileUri = toFileUri(this.getVaultPath(), file.path);

		this.mcpIntegration.sendNotification(
			createAtMentionedNotification(fileUri, startLine, endLine)
		);

		this.viewManager.focusTerminal();
	}
}
