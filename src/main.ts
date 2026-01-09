import {Editor, EditorPosition, MarkdownPreviewView, MarkdownView, Plugin, TFile} from "obsidian";
import {TerminalView, VIEW_TYPE} from "./view/terminal-view";
import {ViewManager} from "./view/view-manager";
import {MCPIntegration} from "./mcp/mcp-integration";
import {createAtMentionedNotification, createCodeRange, createSelectionChangedNotification,} from "./mcp/mcp-notifications";
import {toFileUri} from "./utils/uri-utils";
import {findTextInSection, findTextPositionInSource, findTextWithContext, getTextBeforeSelection} from "./selection/text-position-resolver";
import {loadNerdFont, unloadNerdFont} from "./resources/font-loader";
import {IVaultContext} from "./interfaces";

const SELECTION_NONE = {start: {line: 0, character: 0}, end: {line: 0, character: 0}};

export default class VaultCodePlugin extends Plugin implements IVaultContext {
	private mcpIntegration: MCPIntegration | null = null;
	private viewManager!: ViewManager;

	private lastSelection: string | null = null;
	private lastCursor: EditorPosition | null = null;
	private lastFilePath: string | null = null;
	private selectionPollInterval: ReturnType<typeof setInterval> | null = null;

	async onload(): Promise<void> {
		const basePath = (this.app.vault.adapter as { basePath?: string })?.basePath;
		await loadNerdFont(this.manifest?.dir, basePath);
		await this.startMCPServer();

		this.registerView(VIEW_TYPE, (leaf) => new TerminalView(leaf, this));
		this.viewManager = new ViewManager(this.app.workspace);

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
			editorCallback: (editor, ctx) => {
				this.sendToClaudeCode(editor, ctx.file);
			},
		});

/*		// Track when the active leaf changes
		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				console.debug(`File ${file?.path} open`);
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					this.handleSelectionChange(view.editor, view.file);
				}
			})
		);*/

/*		// Track when the active leaf changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				console.debug(`View file ${view?.file} open`);
				if (view) {
					this.handleSelectionChange(view.editor, view.file);
				}
			})
		);*/

		// Poll for selection changes (CodeMirror doesn't expose selection-change event easily)
		this.selectionPollInterval = setInterval(() => {
			this.pollSelectionChange();
		}, 200);

		this.register(() => {
			if (this.selectionPollInterval) {
				clearInterval(this.selectionPollInterval);
			}
		});
	}

	/**
	 * Poll for selection changes in the active editor.
	 */
	private pollSelectionChange(): void {
		if (!this.mcpIntegration?.hasConnectedClients()) {
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) {
			return;
		}

		this.handleSelectionChange(view, view.file);
	}

	onunload(): void {
		// Stop MCP server
		this.mcpIntegration?.stop();
		this.mcpIntegration = null;

		// Don't detach leaves - Obsidian manages leaf lifecycle during plugin updates
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
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					this.handleSelectionChange(view, view.file);
				}
			},
		});

		await this.mcpIntegration.start();
	}

	/**
	 * Send current selection to Claude Code as an @-mention.
	 */
	private sendToClaudeCode(editor: Editor, file: TFile | null): void {
		if (!this.mcpIntegration?.hasConnectedClients() || !file) {
			return;
		}

		const fileUri = toFileUri(this.getVaultPath(), file.path);
		const selection = editor.listSelections()[0];
		if (!selection) {
			// No selection, send just the file reference
			const notification = createAtMentionedNotification(
				fileUri,
				null,
				null
			);
			this.mcpIntegration.sendNotification(notification);
		} else {
			const startLine = selection.anchor.line;
			const endLine = selection.head.line;
			// Ensure start <= end
			const [start, end] =
				startLine <= endLine ? [startLine, endLine] : [endLine, startLine];

			const notification = createAtMentionedNotification(fileUri, start, end);
			this.mcpIntegration.sendNotification(notification);
		}

		// Focus the terminal
		this.viewManager.focusTerminal();
	}

	/**
	 * Handle selection changes
	 */
	private handleSelectionChange(view: MarkdownView, file: TFile | null): void {
		switch (view.getMode()) {
			case "preview": this.handlePreviewSelection(view.previewMode, file); break;
			case "source": this.handleEditorSelection(view.editor, file); break;
		}
	}

	private async handlePreviewSelection(preview: MarkdownPreviewView, file: TFile | null): Promise<void> {
		if (!this.mcpIntegration?.hasConnectedClients() || !file) {
			return;
		}

		const selectionObj = this.getSelectionInElement(preview.containerEl);
		const selectedText = selectionObj?.toString() || "";
		const filePath = file ? toFileUri(this.getVaultPath(), file.path) : null;

		// Check if selection changed
		if (!this.fileContextChanged(filePath, null, selectedText)) {
			return;
		}

		this.lastFilePath = filePath;
		this.lastSelection = selectedText;
		this.lastCursor = null;

		if (!selectionObj || selectionObj.isCollapsed || !selectedText) {
			// No selection - send empty selection notification
			this.mcpIntegration.sendNotification(createSelectionChangedNotification(
				filePath,
				SELECTION_NONE,
				"",
			));
			return;
		}

		// Get the raw markdown source
		const source = await this.app.vault.cachedRead(file);

		// Try to find the selection using section cache for precision
		const cache = this.app.metadataCache.getFileCache(file);
		const sections = cache?.sections || [];

		// Find which section contains the selection by examining DOM structure
		const range = selectionObj.getRangeAt(0);
		const sectionIndex = this.findSectionIndexFromDOM(preview.containerEl, range);

		let position = null;

		// If we identified the section, search within its bounds
		if (sectionIndex !== -1 && sectionIndex < sections.length) {
			const section = sections[sectionIndex];
			if (section) {
				position = findTextInSection(source, selectedText, section.position);
			}
		}

		// Fallback: use context-based matching for uniqueness
		if (!position) {
			const contextBefore = getTextBeforeSelection(preview.containerEl, range, 30);
			position = findTextWithContext(source, selectedText, contextBefore);
		}

		// Last resort: simple indexOf (first match)
		if (!position) {
			position = findTextPositionInSource(source, selectedText, 0);
		}

		if (position) {
			this.mcpIntegration.sendNotification(createSelectionChangedNotification(
				filePath,
				createCodeRange(position.startLine, position.startChar, position.endLine, position.endChar),
				selectedText,
			));
		}
	}

	/**
	 * Find which section index corresponds to the DOM selection.
	 * Returns -1 if not found.
	 */
	private findSectionIndexFromDOM(container: HTMLElement, range: Range): number {
		// Get all block-level elements that correspond to sections
		const blockSelector = '.el-p, .el-h1, .el-h2, .el-h3, .el-h4, .el-h5, .el-h6, .el-code, .el-blockquote, .el-table, .el-ul, .el-ol';
		const blockElements = Array.from(container.querySelectorAll(blockSelector));

		// Find which block element contains the selection
		let selectedBlock: Element | null = null;
		for (const el of blockElements) {
			if (el.contains(range.commonAncestorContainer)) {
				selectedBlock = el;
				break;
			}
		}

		if (!selectedBlock) return -1;

		// Find the index of this block among all blocks
		const blockIndex = blockElements.indexOf(selectedBlock);

		// Account for frontmatter (yaml section) which doesn't render in preview
		// The sections array includes frontmatter as the first section if present
		const cache = this.app.metadataCache.getFileCache(
			this.app.workspace.getActiveFile() as TFile
		);
		const hasFrontmatter = cache?.frontmatter !== undefined;

		return hasFrontmatter ? blockIndex + 1 : blockIndex;
	}

	private getSelectionInElement(parentElement: HTMLElement): Selection | null {
		const selection = window.getSelection();

		// Check if any text is actually selected
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);

			// Check if the selected range is contained within the specific element
			if (parentElement && parentElement.contains(range.commonAncestorContainer)) {
				return selection;
			}
		}

		return null;
	}

	private handleEditorSelection(editor: Editor, file: TFile | null): void {
		if (!this.mcpIntegration?.hasConnectedClients()) {
			return;
		}

		const selection = editor?.getSelection() || null;
		const cursor = editor?.getCursor() || null;
		const filePath = file ? toFileUri(this.getVaultPath(), file.path) : null;

		// Check if anything actually changed
		if (!this.fileContextChanged(filePath, cursor, selection)) {
			return;
		}

		this.lastFilePath = filePath;
		this.lastSelection = selection;
		this.lastCursor = cursor;

		if (!selection) {
			this.mcpIntegration.sendNotification(createSelectionChangedNotification(
				filePath,
				SELECTION_NONE,
				"",
			));
		} else if (editor) {
			// Has selection
			const sel = editor.listSelections()[0];
			if (sel) {
				const startLine = Math.min(sel.anchor.line, sel.head.line);
				const startCol =
					sel.anchor.line <= sel.head.line ? sel.anchor.ch : sel.head.ch;
				const endLine = Math.max(sel.anchor.line, sel.head.line);
				const endCol =
					sel.anchor.line <= sel.head.line ? sel.head.ch : sel.anchor.ch;

				this.mcpIntegration.sendNotification(createSelectionChangedNotification(
					filePath,
					createCodeRange(startLine, startCol, endLine, endCol),
					editor.getSelection(),
				));
			}
		}
	}

	private fileContextChanged(filePath: string | null, cursor: EditorPosition | null, selection: string | null) {
		const fileChanged = filePath !== this.lastFilePath;
		const cursorChanged = cursor?.line !== this.lastCursor?.line || cursor?.ch !== this.lastCursor?.ch;
		const selectionChanged = selection !== this.lastSelection;

		return fileChanged || cursorChanged || selectionChanged;
	}

	getVaultPath(): string {
		const adapter = this.app.vault.adapter as { basePath?: string };
		return adapter.basePath || "";
	}
}
