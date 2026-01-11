import {describe, it, expect, vi} from "vitest";
import {ViewManager} from "../../src/view/view-manager";
import {VIEW_TYPE} from "../../src/view/terminal-view";
import type {Workspace, WorkspaceLeaf, View} from "obsidian";

// Define mock class that will be used for instanceof checks
// This must be outside the mock factory since vi.mock is hoisted
const mockFocusTerminal = vi.fn();

// Mock the terminal-view module to avoid importing xterm.js
vi.mock("../../src/view/terminal-view", () => {
	// Create the mock class inside the factory
	class TerminalView {
		focusTerminal = mockFocusTerminal;
	}

	return {
		VIEW_TYPE: "vault-terminal",
		TerminalView,
	};
});

// Import the mocked TerminalView for instanceof checks
import {TerminalView} from "../../src/view/terminal-view";

/**
 * Create a mock WorkspaceLeaf.
 */
function createMockLeaf(options: {
	view?: Partial<View>;
	isTerminalView?: boolean;
}): WorkspaceLeaf {
	const {isTerminalView = false} = options;
	let view = options.view;

	if (isTerminalView && !view) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		view = new (TerminalView as any)() as View;
	}

	return {
		view: view ?? ({} as View),
		setViewState: vi.fn().mockResolvedValue(undefined),
	} as unknown as WorkspaceLeaf;
}

/**
 * Create a mock Workspace with configurable state.
 */
function createMockWorkspace(
	options: {
		activeView?: View | null;
		terminalLeaves?: WorkspaceLeaf[];
		markdownLeaves?: WorkspaceLeaf[];
		rightLeaf?: WorkspaceLeaf | null;
	} = {}
): Workspace {
	const {
		activeView = null,
		terminalLeaves = [],
		markdownLeaves = [],
		rightLeaf = null,
	} = options;

	return {
		getActiveViewOfType: vi.fn((viewClass: unknown) => {
			if (viewClass === TerminalView && activeView instanceof TerminalView) {
				return activeView;
			}
			return null;
		}),
		getLeavesOfType: vi.fn((type: string) => {
			if (type === VIEW_TYPE) {
				return terminalLeaves;
			}
			if (type === "markdown") {
				return markdownLeaves;
			}
			return [];
		}),
		setActiveLeaf: vi.fn(),
		revealLeaf: vi.fn().mockResolvedValue(undefined),
		getRightLeaf: vi.fn(() => rightLeaf),
	} as unknown as Workspace;
}

describe("ViewManager", () => {
	let manager: ViewManager;
	let workspace: Workspace;

	describe("toggleFocus", () => {
		describe("when currently in Claude terminal", () => {
			it("should switch to first markdown editor", async () => {
				const markdownLeaf = createMockLeaf({});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const terminalView = new (TerminalView as any)() as View;

				workspace = createMockWorkspace({
					activeView: terminalView,
					markdownLeaves: [markdownLeaf],
				});
				manager = new ViewManager(workspace);

				await manager.toggleFocus();

				expect(workspace.setActiveLeaf).toHaveBeenCalledWith(markdownLeaf, {
					focus: true,
				});
			});

			it("should do nothing if no markdown editors exist", async () => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const terminalView = new (TerminalView as any)() as View;

				workspace = createMockWorkspace({
					activeView: terminalView,
					markdownLeaves: [],
				});
				manager = new ViewManager(workspace);

				await manager.toggleFocus();

				expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
			});

			it("should only switch to first markdown leaf when multiple exist", async () => {
				const markdownLeaf1 = createMockLeaf({});
				const markdownLeaf2 = createMockLeaf({});
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const terminalView = new (TerminalView as any)() as View;

				workspace = createMockWorkspace({
					activeView: terminalView,
					markdownLeaves: [markdownLeaf1, markdownLeaf2],
				});
				manager = new ViewManager(workspace);

				await manager.toggleFocus();

				expect(workspace.setActiveLeaf).toHaveBeenCalledTimes(1);
				expect(workspace.setActiveLeaf).toHaveBeenCalledWith(markdownLeaf1, {
					focus: true,
				});
			});
		});

		describe("when currently in editor", () => {
			it("should switch to Claude terminal", async () => {
				mockFocusTerminal.mockClear();
				const terminalLeaf = createMockLeaf({isTerminalView: true});

				workspace = createMockWorkspace({
					activeView: null,
					terminalLeaves: [terminalLeaf],
				});
				manager = new ViewManager(workspace);

				await manager.toggleFocus();

				expect(workspace.setActiveLeaf).toHaveBeenCalledWith(terminalLeaf, {
					focus: true,
				});
			});

			it("should call focusTerminal on the view", async () => {
				mockFocusTerminal.mockClear();
				const terminalLeaf = createMockLeaf({isTerminalView: true});

				workspace = createMockWorkspace({
					activeView: null,
					terminalLeaves: [terminalLeaf],
				});
				manager = new ViewManager(workspace);

				await manager.toggleFocus();

				expect(mockFocusTerminal).toHaveBeenCalled();
			});
		});
	});

	describe("focusTerminal", () => {
		it("should focus the first Claude terminal leaf", () => {
			mockFocusTerminal.mockClear();
			const terminalLeaf = createMockLeaf({isTerminalView: true});

			workspace = createMockWorkspace({
				terminalLeaves: [terminalLeaf],
			});
			manager = new ViewManager(workspace);

			manager.focusTerminal();

			expect(workspace.setActiveLeaf).toHaveBeenCalledWith(terminalLeaf, {
				focus: true,
			});
		});

		it("should call focusTerminal on the view if it is a TerminalView", () => {
			mockFocusTerminal.mockClear();
			const terminalLeaf = createMockLeaf({isTerminalView: true});

			workspace = createMockWorkspace({
				terminalLeaves: [terminalLeaf],
			});
			manager = new ViewManager(workspace);

			manager.focusTerminal();

			expect(mockFocusTerminal).toHaveBeenCalled();
		});

		it("should do nothing if no terminal leaves exist", () => {
			workspace = createMockWorkspace({
				terminalLeaves: [],
			});
			manager = new ViewManager(workspace);

			manager.focusTerminal();

			expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
		});

		it("should only focus first leaf when multiple exist", () => {
			mockFocusTerminal.mockClear();
			const terminalLeaf1 = createMockLeaf({isTerminalView: true});
			const terminalLeaf2 = createMockLeaf({isTerminalView: true});

			workspace = createMockWorkspace({
				terminalLeaves: [terminalLeaf1, terminalLeaf2],
			});
			manager = new ViewManager(workspace);

			manager.focusTerminal();

			expect(workspace.setActiveLeaf).toHaveBeenCalledTimes(1);
			expect(workspace.setActiveLeaf).toHaveBeenCalledWith(terminalLeaf1, {
				focus: true,
			});
		});

		it("should not call focusTerminal if view is not a TerminalView", () => {
			const customFocusTerminal = vi.fn();
			const mockView = {focusTerminal: customFocusTerminal};
			const leaf = createMockLeaf({view: mockView as unknown as View});

			workspace = createMockWorkspace({
				terminalLeaves: [leaf],
			});
			manager = new ViewManager(workspace);

			manager.focusTerminal();

			// setActiveLeaf should still be called
			expect(workspace.setActiveLeaf).toHaveBeenCalled();
			// but focusTerminal should NOT be called since it's not instanceof TerminalView
			expect(customFocusTerminal).not.toHaveBeenCalled();
		});
	});

	describe("activateView", () => {
		it("should reveal existing leaf if one exists", async () => {
			const terminalLeaf = createMockLeaf({isTerminalView: true});

			workspace = createMockWorkspace({
				terminalLeaves: [terminalLeaf],
			});
			manager = new ViewManager(workspace);

			await manager.activateView();

			expect(workspace.revealLeaf).toHaveBeenCalledWith(terminalLeaf);
			expect(workspace.getRightLeaf).not.toHaveBeenCalled();
		});

		it("should create new tab if no existing leaf", async () => {
			const rightLeaf = createMockLeaf({});

			workspace = createMockWorkspace({
				terminalLeaves: [],
				rightLeaf,
			});
			manager = new ViewManager(workspace);

			await manager.activateView();

			expect(rightLeaf.setViewState).toHaveBeenCalledWith({
				type: VIEW_TYPE,
				active: true,
			});
			expect(workspace.revealLeaf).toHaveBeenCalledWith(rightLeaf);
		});

		it("should only reveal first leaf when multiple exist", async () => {
			const terminalLeaf1 = createMockLeaf({isTerminalView: true});
			const terminalLeaf2 = createMockLeaf({isTerminalView: true});

			workspace = createMockWorkspace({
				terminalLeaves: [terminalLeaf1, terminalLeaf2],
			});
			manager = new ViewManager(workspace);

			await manager.activateView();

			expect(workspace.revealLeaf).toHaveBeenCalledTimes(1);
			expect(workspace.revealLeaf).toHaveBeenCalledWith(terminalLeaf1);
		});
	});

	describe("createNewTab", () => {
		it("should create a new tab in the right sidebar", async () => {
			const rightLeaf = createMockLeaf({});

			workspace = createMockWorkspace({
				rightLeaf,
			});
			manager = new ViewManager(workspace);

			await manager.createNewTab();

			expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
			expect(rightLeaf.setViewState).toHaveBeenCalledWith({
				type: VIEW_TYPE,
				active: true,
			});
			expect(workspace.revealLeaf).toHaveBeenCalledWith(rightLeaf);
		});

		it("should do nothing if getRightLeaf returns null", async () => {
			workspace = createMockWorkspace({
				rightLeaf: null,
			});
			manager = new ViewManager(workspace);

			await manager.createNewTab();

			expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
			expect(workspace.revealLeaf).not.toHaveBeenCalled();
		});

		it("should call setViewState before revealLeaf", async () => {
			const callOrder: string[] = [];
			const rightLeaf = createMockLeaf({});
			(rightLeaf.setViewState as ReturnType<typeof vi.fn>).mockImplementation(
				async () => {
					callOrder.push("setViewState");
				}
			);

			workspace = createMockWorkspace({rightLeaf});
			(workspace.revealLeaf as ReturnType<typeof vi.fn>).mockImplementation(
				async () => {
					callOrder.push("revealLeaf");
				}
			);
			manager = new ViewManager(workspace);

			await manager.createNewTab();

			expect(callOrder).toEqual(["setViewState", "revealLeaf"]);
		});
	});
});
