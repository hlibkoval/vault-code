import {App, Editor, EditorPosition, MarkdownPreviewView, MarkdownView, TFile} from "obsidian";
import {INotificationSender, IVaultContext} from "../interfaces";
import {createCodeRange, createSelectionChangedNotification} from "../mcp/mcp-notifications";
import {toFileUri} from "../utils/uri-utils";
import {findTextInSection, findTextPositionInSource, findTextWithContext, getTextBeforeSelection} from "./text-position-resolver";

const SELECTION_NONE = {start: {line: 0, character: 0}, end: {line: 0, character: 0}};

export interface SelectionTrackerOptions {
	app: App;
	vaultContext: IVaultContext;
	notificationSender: INotificationSender;
}

/**
 * Tracks selection changes in editor and preview modes.
 * Sends notifications to Claude Code when selection changes.
 */
export class SelectionTracker {
	private app: App;
	private vaultContext: IVaultContext;
	private notificationSender: INotificationSender;

	private lastSelection: string | null = null;
	private lastCursor: EditorPosition | null = null;
	private lastFilePath: string | null = null;
	private pollInterval: ReturnType<typeof setInterval> | null = null;

	constructor(options: SelectionTrackerOptions) {
		this.app = options.app;
		this.vaultContext = options.vaultContext;
		this.notificationSender = options.notificationSender;
	}

	/**
	 * Start polling for selection changes.
	 */
	start(): void {
		this.pollInterval = setInterval(() => {
			this.pollSelectionChange();
		}, 200);
	}

	/**
	 * Stop polling for selection changes.
	 */
	stop(): void {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}

	/**
	 * Notify that selection may have changed (e.g., after MCP initialization).
	 */
	notifySelectionChanged(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			this.handleSelectionChange(view, view.file);
		}
	}

	private pollSelectionChange(): void {
		if (!this.notificationSender.hasConnectedClients()) {
			return;
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) {
			return;
		}

		this.handleSelectionChange(view, view.file);
	}

	private handleSelectionChange(view: MarkdownView, file: TFile | null): void {
		switch (view.getMode()) {
			case "preview":
				void this.handlePreviewSelection(view.previewMode, file);
				break;
			case "source":
				this.handleEditorSelection(view.editor, file);
				break;
		}
	}

	private async handlePreviewSelection(preview: MarkdownPreviewView, file: TFile | null): Promise<void> {
		if (!this.notificationSender.hasConnectedClients() || !file) {
			return;
		}

		const selectionObj = this.getSelectionInElement(preview.containerEl);
		const selectedText = selectionObj?.toString() || "";
		const filePath = file ? toFileUri(this.vaultContext.getVaultPath(), file.path) : null;

		// Check if selection changed
		if (!this.fileContextChanged(filePath, null, selectedText)) {
			return;
		}

		this.lastFilePath = filePath;
		this.lastSelection = selectedText;
		this.lastCursor = null;

		if (!selectionObj || selectionObj.isCollapsed || !selectedText) {
			// No selection - send empty selection notification
			this.notificationSender.sendNotification(createSelectionChangedNotification(
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
			this.notificationSender.sendNotification(createSelectionChangedNotification(
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
		if (!this.notificationSender.hasConnectedClients()) {
			return;
		}

		const selection = editor?.getSelection() || null;
		const cursor = editor?.getCursor() || null;
		const filePath = file ? toFileUri(this.vaultContext.getVaultPath(), file.path) : null;

		// Check if anything actually changed
		if (!this.fileContextChanged(filePath, cursor, selection)) {
			return;
		}

		this.lastFilePath = filePath;
		this.lastSelection = selection;
		this.lastCursor = cursor;

		if (!selection) {
			this.notificationSender.sendNotification(createSelectionChangedNotification(
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

				this.notificationSender.sendNotification(createSelectionChangedNotification(
					filePath,
					createCodeRange(startLine, startCol, endLine, endCol),
					editor.getSelection(),
				));
			}
		}
	}

	private fileContextChanged(filePath: string | null, cursor: EditorPosition | null, selection: string | null): boolean {
		const fileChanged = filePath !== this.lastFilePath;
		const cursorChanged = cursor?.line !== this.lastCursor?.line || cursor?.ch !== this.lastCursor?.ch;
		const selectionChanged = selection !== this.lastSelection;

		return fileChanged || cursorChanged || selectionChanged;
	}
}
