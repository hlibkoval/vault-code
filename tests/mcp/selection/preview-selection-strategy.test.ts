import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {PreviewSelectionStrategy} from "../../../src/mcp/selection/preview-selection-strategy";
import {LINE_START_ATTR, LINE_END_ATTR} from "../../../src/mcp/line-marker-processor";
import {createMockTFile, createMockPreviewView} from "../../mocks/obsidian";

describe("PreviewSelectionStrategy", () => {
	const strategy = new PreviewSelectionStrategy();
	let containerEl: HTMLDivElement;

	beforeEach(() => {
		containerEl = document.createElement("div");
		document.body.appendChild(containerEl);
	});

	afterEach(() => {
		document.body.removeChild(containerEl);
		window.getSelection()?.removeAllRanges();
	});

	/**
	 * Helper to create a paragraph with line markers
	 */
	function createMarkedParagraph(
		text: string,
		lineStart: number,
		lineEnd: number
	): HTMLParagraphElement {
		const p = document.createElement("p");
		p.textContent = text;
		p.setAttribute(LINE_START_ATTR, String(lineStart));
		p.setAttribute(LINE_END_ATTR, String(lineEnd));
		return p;
	}

	/**
	 * Helper to create a selection in the DOM
	 */
	function createSelection(
		startNode: Node,
		startOffset: number,
		endNode: Node,
		endOffset: number
	): Selection {
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		const range = document.createRange();
		range.setStart(startNode, startOffset);
		range.setEnd(endNode, endOffset);
		selection.addRange(range);
		return selection;
	}

	describe("extractSelection", () => {
		it("should return null when no selection exists", () => {
			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).toBeNull();
		});

		it("should return null when selection is collapsed (cursor only)", () => {
			const p = createMarkedParagraph("Hello world", 0, 0);
			containerEl.appendChild(p);

			// Create collapsed selection (cursor position, not a range)
			createSelection(p.firstChild!, 5, p.firstChild!, 5);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).toBeNull();
		});

		it("should return null when selection is outside container", () => {
			const outsideEl = document.createElement("div");
			document.body.appendChild(outsideEl);
			outsideEl.textContent = "Outside content";

			createSelection(outsideEl.firstChild!, 0, outsideEl.firstChild!, 7);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			document.body.removeChild(outsideEl);
			expect(result).toBeNull();
		});

		it("should extract single-line selection with line markers", () => {
			const p = createMarkedParagraph("Hello world", 5, 5);
			containerEl.appendChild(p);

			// Select "world"
			createSelection(p.firstChild!, 6, p.firstChild!, 11);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).not.toBeNull();
			expect(result?.selectedText).toBe("world");
			expect(result?.range.start.line).toBe(5);
		});

		it("should return null when element has no line markers", () => {
			const p = document.createElement("p");
			p.textContent = "No markers";
			containerEl.appendChild(p);

			createSelection(p.firstChild!, 0, p.firstChild!, 2);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).toBeNull();
		});

		it("should find line markers from parent elements", () => {
			const div = document.createElement("div");
			div.setAttribute(LINE_START_ATTR, "10");
			div.setAttribute(LINE_END_ATTR, "12");

			const span = document.createElement("span");
			span.textContent = "Nested text";
			div.appendChild(span);
			containerEl.appendChild(div);

			createSelection(span.firstChild!, 0, span.firstChild!, 6);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).not.toBeNull();
			expect(result?.range.start.line).toBe(10);
		});

		it("should handle element with only LINE_START_ATTR (missing LINE_END_ATTR)", () => {
			const p = document.createElement("p");
			p.textContent = "Partial markers";
			p.setAttribute(LINE_START_ATTR, "5");
			// Missing LINE_END_ATTR
			containerEl.appendChild(p);

			createSelection(p.firstChild!, 0, p.firstChild!, 7);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).toBeNull();
		});

		it("should handle selection at line 0", () => {
			const p = createMarkedParagraph("First line content", 0, 0);
			containerEl.appendChild(p);

			createSelection(p.firstChild!, 0, p.firstChild!, 5);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).not.toBeNull();
			expect(result?.range.start.line).toBe(0);
		});

		it("should handle selection with trailing empty lines", () => {
			// Create content with multiple lines where trailing lines are empty
			const p = createMarkedParagraph("Line 1\n\n", 0, 2);
			containerEl.appendChild(p);

			// Select the whole content including trailing newlines
			createSelection(p.firstChild!, 0, p.firstChild!, 8);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).not.toBeNull();
			// Empty lines at the end should be dropped
			expect(result?.range.start.line).toBe(0);
		});

		it("should handle selection starting at element node", () => {
			const p = createMarkedParagraph("Hello world", 5, 5);
			containerEl.appendChild(p);

			// Select starting from the element itself (not the text node)
			// This triggers the node.nodeType === Node.ELEMENT_NODE branch
			createSelection(p, 0, p.firstChild!, 5);

			const preview = createMockPreviewView(containerEl);
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(preview, file);

			expect(result).not.toBeNull();
			expect(result?.range.start.line).toBe(5);
		});
	});

	describe("getSelectedText", () => {
		it("should return selected text", () => {
			const p = createMarkedParagraph("Hello world", 0, 0);
			containerEl.appendChild(p);

			createSelection(p.firstChild!, 0, p.firstChild!, 5);

			const preview = createMockPreviewView(containerEl);

			const result = strategy.getSelectedText(preview);

			expect(result).toBe("Hello");
		});

		it("should return empty string when no selection", () => {
			const preview = createMockPreviewView(containerEl);

			const result = strategy.getSelectedText(preview);

			expect(result).toBe("");
		});

		it("should return empty string when selection is outside container", () => {
			const outsideEl = document.createElement("div");
			document.body.appendChild(outsideEl);
			outsideEl.textContent = "Outside";

			createSelection(outsideEl.firstChild!, 0, outsideEl.firstChild!, 3);

			const preview = createMockPreviewView(containerEl);

			const result = strategy.getSelectedText(preview);

			document.body.removeChild(outsideEl);
			expect(result).toBe("");
		});
	});
});
