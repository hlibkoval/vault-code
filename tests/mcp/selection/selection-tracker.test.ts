import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import type {App, MarkdownView, TFile, Editor, MarkdownPreviewView} from "obsidian";
import type {INotificationSender, IVaultContext} from "../../../src/interfaces";
import type {SelectionResult} from "../../../src/mcp/selection/selection-strategy";

// Mock strategies - use vi.hoisted to avoid hoisting issues
const {mockExtractSelection, mockGetSelectedText, MockEditorStrategy, MockPreviewStrategy} =
	vi.hoisted(() => {
		const mockExtractSelection = vi.fn().mockReturnValue(null);
		const mockGetSelectedText = vi.fn().mockReturnValue("");

		class MockEditorStrategy {
			extractSelection = mockExtractSelection;
			getSelectedText = mockGetSelectedText;
		}

		class MockPreviewStrategy {
			extractSelection = mockExtractSelection;
			getSelectedText = mockGetSelectedText;
		}

		return {
			mockExtractSelection,
			mockGetSelectedText,
			MockEditorStrategy,
			MockPreviewStrategy,
		};
	});

vi.mock("../../../src/mcp/selection/editor-selection-strategy", () => ({
	EditorSelectionStrategy: MockEditorStrategy,
}));

vi.mock("../../../src/mcp/selection/preview-selection-strategy", () => ({
	PreviewSelectionStrategy: MockPreviewStrategy,
}));

// Import after mocks
import {SelectionTracker} from "../../../src/mcp/selection/selection-tracker";

/**
 * Create a mock TFile.
 */
function createMockFile(path: string): TFile {
	return {
		path,
		name: path.split("/").pop() || "",
		basename: path.split("/").pop()?.replace(/\.[^.]+$/, "") || "",
		extension: "md",
		vault: {} as TFile["vault"],
		parent: null,
		stat: {ctime: 0, mtime: 0, size: 0},
	} as TFile;
}

/**
 * Create a mock MarkdownView.
 */
function createMockMarkdownView(options: {
	mode?: "source" | "preview";
	file?: TFile | null;
}): MarkdownView {
	const {mode = "source", file = createMockFile("test.md")} = options;

	return {
		getMode: vi.fn(() => mode),
		file,
		editor: {} as Editor,
		previewMode: {} as MarkdownPreviewView,
	} as unknown as MarkdownView;
}

/**
 * Create a mock App.
 */
function createMockApp(activeView: MarkdownView | null = null): App {
	return {
		workspace: {
			getActiveViewOfType: vi.fn(() => activeView),
		},
	} as unknown as App;
}

/**
 * Create a mock notification sender.
 */
function createMockNotificationSender(hasClients = true): INotificationSender {
	return {
		sendNotification: vi.fn(),
		hasConnectedClients: vi.fn().mockReturnValue(hasClients),
	};
}

/**
 * Create a mock vault context.
 */
function createMockVaultContext(vaultPath = "/test/vault"): IVaultContext {
	return {
		getVaultPath: vi.fn(() => vaultPath),
	};
}

describe("SelectionTracker", () => {
	let tracker: SelectionTracker;
	let mockApp: App;
	let mockNotificationSender: INotificationSender;
	let mockVaultContext: IVaultContext;
	let mockView: MarkdownView;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();

		mockView = createMockMarkdownView({});
		mockApp = createMockApp(mockView);
		mockNotificationSender = createMockNotificationSender();
		mockVaultContext = createMockVaultContext();

		tracker = new SelectionTracker({
			app: mockApp,
			notificationSender: mockNotificationSender,
			vaultContext: mockVaultContext,
		});
	});

	afterEach(() => {
		tracker.stop();
		vi.useRealTimers();
	});

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			const app = createMockApp();
			const sender = createMockNotificationSender();
			const context = createMockVaultContext();

			const t = new SelectionTracker({
				app,
				notificationSender: sender,
				vaultContext: context,
			});

			expect(t).toBeDefined();
			t.stop();
		});
	});

	describe("start", () => {
		it("should start polling at 500ms interval", () => {
			tracker.start();

			// Advance time by 500ms
			vi.advanceTimersByTime(500);

			// pollSelectionChange should be called (check via hasConnectedClients call)
			expect(mockNotificationSender.hasConnectedClients).toHaveBeenCalled();
		});

		it("should poll multiple times", () => {
			// Use a tracker with no clients so it doesn't do extra calls to hasConnectedClients
			const noClientSender = createMockNotificationSender(false);
			const t = new SelectionTracker({
				app: mockApp,
				notificationSender: noClientSender,
				vaultContext: mockVaultContext,
			});

			t.start();

			// Advance through 3 poll cycles
			vi.advanceTimersByTime(1500);

			// Should have been called 3 times (at 500ms, 1000ms, 1500ms)
			expect(noClientSender.hasConnectedClients).toHaveBeenCalledTimes(3);

			t.stop();
		});
	});

	describe("stop", () => {
		it("should stop polling", () => {
			// Use a tracker with no clients so it doesn't do extra calls to hasConnectedClients
			const noClientSender = createMockNotificationSender(false);
			const t = new SelectionTracker({
				app: mockApp,
				notificationSender: noClientSender,
				vaultContext: mockVaultContext,
			});

			t.start();

			// Advance 500ms to trigger one poll
			vi.advanceTimersByTime(500);
			expect(noClientSender.hasConnectedClients).toHaveBeenCalledTimes(1);

			// Stop and advance more time
			t.stop();
			vi.advanceTimersByTime(1000);

			// No additional polls should occur
			expect(noClientSender.hasConnectedClients).toHaveBeenCalledTimes(1);
		});

		it("should be safe to call when not started", () => {
			expect(() => tracker.stop()).not.toThrow();
		});

		it("should be safe to call multiple times", () => {
			tracker.start();
			tracker.stop();
			expect(() => tracker.stop()).not.toThrow();
		});
	});

	describe("notifySelectionChanged", () => {
		it("should send notification immediately when immediate=true", () => {
			mockGetSelectedText.mockReturnValue("selected text");
			mockExtractSelection.mockReturnValue({
				range: {
					start: {line: 0, character: 0},
					end: {line: 0, character: 13},
				},
				selectedText: "selected text",
			} as SelectionResult);

			tracker.notifySelectionChanged(true);

			expect(mockNotificationSender.sendNotification).toHaveBeenCalled();
		});

		it("should delay 500ms when immediate=false", () => {
			mockGetSelectedText.mockReturnValue("selected text");
			mockExtractSelection.mockReturnValue({
				range: {
					start: {line: 0, character: 0},
					end: {line: 0, character: 13},
				},
				selectedText: "selected text",
			} as SelectionResult);

			tracker.notifySelectionChanged(false);

			// Should not be called yet
			expect(mockNotificationSender.sendNotification).not.toHaveBeenCalled();

			// Advance 500ms
			vi.advanceTimersByTime(500);

			expect(mockNotificationSender.sendNotification).toHaveBeenCalled();
		});

		it("should reset cached state before sending", () => {
			// First call establishes state
			mockGetSelectedText.mockReturnValue("text1");
			mockExtractSelection.mockReturnValue({
				range: {
					start: {line: 0, character: 0},
					end: {line: 0, character: 5},
				},
				selectedText: "text1",
			} as SelectionResult);

			tracker.start();
			vi.advanceTimersByTime(500);

			// Now change to same text - normally would be deduplicated
			mockNotificationSender.sendNotification = vi.fn();

			// notifySelectionChanged resets state, so same text should still trigger
			tracker.notifySelectionChanged(true);

			expect(mockNotificationSender.sendNotification).toHaveBeenCalled();
		});

		it("should not send if no active MarkdownView", () => {
			mockApp = createMockApp(null);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			tracker.notifySelectionChanged(true);

			expect(mockNotificationSender.sendNotification).not.toHaveBeenCalled();
		});

		it("should not send if view has no file", () => {
			mockView = createMockMarkdownView({file: null});
			mockApp = createMockApp(mockView);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			tracker.notifySelectionChanged(true);

			expect(mockNotificationSender.sendNotification).not.toHaveBeenCalled();
		});
	});

	describe("pollSelectionChange", () => {
		it("should skip if no connected clients", () => {
			mockNotificationSender = createMockNotificationSender(false);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockGetSelectedText).not.toHaveBeenCalled();
		});

		it("should skip if no active MarkdownView", () => {
			mockApp = createMockApp(null);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockGetSelectedText).not.toHaveBeenCalled();
		});

		it("should skip if view has no file", () => {
			mockView = createMockMarkdownView({file: null});
			mockApp = createMockApp(mockView);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockGetSelectedText).not.toHaveBeenCalled();
		});
	});

	describe("handleSelectionChange - mode detection", () => {
		it("should use preview strategy in preview mode", () => {
			mockView = createMockMarkdownView({mode: "preview"});
			mockApp = createMockApp(mockView);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			mockGetSelectedText.mockReturnValue("preview text");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 0, character: 0}, end: {line: 0, character: 12}},
				selectedText: "preview text",
			} as SelectionResult);

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockGetSelectedText).toHaveBeenCalled();
			expect(mockNotificationSender.sendNotification).toHaveBeenCalled();
		});

		it("should use editor strategy in source mode", () => {
			mockView = createMockMarkdownView({mode: "source"});
			mockApp = createMockApp(mockView);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			mockGetSelectedText.mockReturnValue("source text");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 0, character: 0}, end: {line: 0, character: 11}},
				selectedText: "source text",
			} as SelectionResult);

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockGetSelectedText).toHaveBeenCalled();
			expect(mockNotificationSender.sendNotification).toHaveBeenCalled();
		});
	});

	describe("deduplication", () => {
		it("should not send notification for same file and selection", () => {
			mockGetSelectedText.mockReturnValue("same text");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 0, character: 0}, end: {line: 0, character: 9}},
				selectedText: "same text",
			} as SelectionResult);

			tracker.start();

			// First poll - should send
			vi.advanceTimersByTime(500);
			expect(mockNotificationSender.sendNotification).toHaveBeenCalledTimes(1);

			// Second poll - same state, should NOT send
			vi.advanceTimersByTime(500);
			expect(mockNotificationSender.sendNotification).toHaveBeenCalledTimes(1);
		});

		it("should send notification when selection changes", () => {
			mockGetSelectedText.mockReturnValue("text1");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 0, character: 0}, end: {line: 0, character: 5}},
				selectedText: "text1",
			} as SelectionResult);

			tracker.start();
			vi.advanceTimersByTime(500);
			expect(mockNotificationSender.sendNotification).toHaveBeenCalledTimes(1);

			// Change selection
			mockGetSelectedText.mockReturnValue("text2");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 0, character: 0}, end: {line: 0, character: 5}},
				selectedText: "text2",
			} as SelectionResult);

			vi.advanceTimersByTime(500);
			expect(mockNotificationSender.sendNotification).toHaveBeenCalledTimes(2);
		});

		it("should send notification when file changes", () => {
			const file1 = createMockFile("file1.md");
			const file2 = createMockFile("file2.md");

			mockView = createMockMarkdownView({file: file1});
			mockApp = createMockApp(mockView);
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			mockGetSelectedText.mockReturnValue("same text");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 0, character: 0}, end: {line: 0, character: 9}},
				selectedText: "same text",
			} as SelectionResult);

			tracker.start();
			vi.advanceTimersByTime(500);
			expect(mockNotificationSender.sendNotification).toHaveBeenCalledTimes(1);

			// Change to different file
			mockView = createMockMarkdownView({file: file2});
			mockApp = createMockApp(mockView);
			// Recreate tracker with new app (simulating file switch)
			tracker.stop();
			tracker = new SelectionTracker({
				app: mockApp,
				notificationSender: mockNotificationSender,
				vaultContext: mockVaultContext,
			});

			tracker.start();
			vi.advanceTimersByTime(500);
			// New tracker instance starts fresh, so it sends notification
			expect(mockNotificationSender.sendNotification).toHaveBeenCalledTimes(2);
		});
	});

	describe("sendNotification", () => {
		it("should create notification with file URI", () => {
			mockGetSelectedText.mockReturnValue("test");
			mockExtractSelection.mockReturnValue({
				range: {start: {line: 1, character: 5}, end: {line: 2, character: 10}},
				selectedText: "test",
			} as SelectionResult);

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockNotificationSender.sendNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					jsonrpc: "2.0",
					method: "selection_changed",
					params: expect.objectContaining({
						filePath: expect.stringContaining("file://"),
					}),
				})
			);
		});

		it("should use EMPTY_RANGE when extractSelection returns null", () => {
			mockGetSelectedText.mockReturnValue("test");
			mockExtractSelection.mockReturnValue(null);

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockNotificationSender.sendNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						selection: {
							start: {line: 0, character: 0},
							end: {line: 0, character: 0},
						},
					}),
				})
			);
		});

		it("should use empty string when result has no selectedText", () => {
			mockGetSelectedText.mockReturnValue("");
			mockExtractSelection.mockReturnValue(null);

			tracker.start();
			vi.advanceTimersByTime(500);

			expect(mockNotificationSender.sendNotification).toHaveBeenCalledWith(
				expect.objectContaining({
					params: expect.objectContaining({
						text: "",
					}),
				})
			);
		});
	});
});
