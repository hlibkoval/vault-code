import {App, EditorPosition, MarkdownView, TFile} from "obsidian";
import {INotificationSender, IVaultContext} from "../interfaces";
import {createSelectionChangedNotification} from "../mcp/mcp-notifications";
import {toFileUri} from "../utils/uri-utils";
import {EMPTY_RANGE, SelectionResult, SelectionStrategy} from "./selection-strategy";
import {EditorSelectionStrategy} from "./editor-selection-strategy";
import {PreviewSelectionStrategy} from "./preview-selection-strategy";

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

	// Strategies for different view modes
	private editorStrategy: EditorSelectionStrategy;
	private previewStrategy: PreviewSelectionStrategy;

	// Deduplication state
	private lastSelection: string | null = null;
	private lastCursor: EditorPosition | null = null;
	private lastFilePath: string | null = null;
	private pollInterval: ReturnType<typeof setInterval> | null = null;

	constructor(options: SelectionTrackerOptions) {
		this.app = options.app;
		this.vaultContext = options.vaultContext;
		this.notificationSender = options.notificationSender;

		// Initialize strategies
		this.editorStrategy = new EditorSelectionStrategy();
		this.previewStrategy = new PreviewSelectionStrategy();
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
		if (!file || !this.notificationSender.hasConnectedClients()) {
			return;
		}

		switch (view.getMode()) {
			case "preview":
				this.handleMode(this.previewStrategy, view.previewMode, file);
				break;
			case "source":
				this.handleMode(this.editorStrategy, view.editor, file);
				break;
		}
	}

	private handleMode(strategy: SelectionStrategy, view: unknown, file: TFile): void {
		const filePath = toFileUri(this.vaultContext.getVaultPath(), file.path);
		const selectedText = strategy.getSelectedText(view);
		const cursor = strategy.getCursor(view);

		if (!this.hasContextChanged(filePath, cursor, selectedText)) {
			return;
		}

		this.updateState(filePath, cursor, selectedText);
		const result = strategy.extract(view, file);
		this.sendNotification(filePath, result);
	}

	private hasContextChanged(
		filePath: string | null,
		cursor: EditorPosition | null,
		selection: string | null
	): boolean {
		const fileChanged = filePath !== this.lastFilePath;
		const cursorChanged =
			cursor?.line !== this.lastCursor?.line || cursor?.ch !== this.lastCursor?.ch;
		const selectionChanged = selection !== this.lastSelection;

		return fileChanged || cursorChanged || selectionChanged;
	}

	private updateState(
		filePath: string | null,
		cursor: EditorPosition | null,
		selection: string | null
	): void {
		this.lastFilePath = filePath;
		this.lastCursor = cursor;
		this.lastSelection = selection;
	}

	private sendNotification(filePath: string, result: SelectionResult | null): void {
		this.notificationSender.sendNotification(
			createSelectionChangedNotification(
				filePath,
				result?.range ?? EMPTY_RANGE,
				result?.selectedText ?? ""
			)
		);
	}
}
