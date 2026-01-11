import {App, Editor, EditorPosition, MarkdownPreviewView, MarkdownView, TFile} from "obsidian";
import {INotificationSender, IVaultContext} from "../interfaces";
import {createCodeRange, createSelectionChangedNotification} from "../mcp/mcp-notifications";
import {toFileUri} from "../utils/uri-utils";
import {PreviewSelectionExtractor} from "./preview-selection-extractor";

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
	private previewExtractor: PreviewSelectionExtractor;

	private lastSelection: string | null = null;
	private lastCursor: EditorPosition | null = null;
	private lastFilePath: string | null = null;
	private pollInterval: ReturnType<typeof setInterval> | null = null;

	constructor(options: SelectionTrackerOptions) {
		this.app = options.app;
		this.vaultContext = options.vaultContext;
		this.notificationSender = options.notificationSender;
		this.previewExtractor = new PreviewSelectionExtractor(options.app);
	}

	/**
	 * Start polling for selection changes.
	 */
	start(): void {
		this.pollInterval = setInterval(() => {
			this.pollSelectionChange();
		}, 500);
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

		const filePath = toFileUri(this.vaultContext.getVaultPath(), file.path);
		const selectedText = this.previewExtractor.getSelectedText(preview);

		// Check if selection changed
		if (!this.fileContextChanged(filePath, null, selectedText)) {
			return;
		}

		this.lastFilePath = filePath;
		this.lastSelection = selectedText;
		this.lastCursor = null;

		// Extract position using the dedicated extractor
		const result = await this.previewExtractor.extract(preview);

		if (!result) {
			// No selection - send empty selection notification
			this.notificationSender.sendNotification(createSelectionChangedNotification(
				filePath,
				SELECTION_NONE,
				"",
			));
		} else {
			this.notificationSender.sendNotification(createSelectionChangedNotification(
				filePath,
				createCodeRange(result.startLine, result.startChar, result.endLine, result.endChar),
				result.selectedText,
			));
		}
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
