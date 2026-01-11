import {describe, it, expect} from "vitest";
import {EditorSelectionStrategy} from "../../../src/mcp/selection/editor-selection-strategy";
import {
	createMockEditor,
	createMockTFile,
} from "../../mocks/obsidian";

describe("EditorSelectionStrategy", () => {
	const strategy = new EditorSelectionStrategy();

	describe("extractSelection", () => {
		it("should return null when no text is selected", () => {
			const editor = createMockEditor({selection: ""});
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(editor, file);

			expect(result).toBeNull();
		});

		it("should return null when listSelections returns empty array", () => {
			const editor = createMockEditor({
				selection: "some text",
				selections: [],
			});
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(editor, file);

			expect(result).toBeNull();
		});

		it("should extract single-line selection correctly", () => {
			const editor = createMockEditor({
				selection: "selected text",
				selections: [
					{
						anchor: {line: 5, ch: 10},
						head: {line: 5, ch: 23},
					},
				],
			});
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(editor, file);

			expect(result).not.toBeNull();
			expect(result?.selectedText).toBe("selected text");
			expect(result?.range.start.line).toBe(5);
			expect(result?.range.start.character).toBe(10);
			expect(result?.range.end.line).toBe(5);
			expect(result?.range.end.character).toBe(23);
		});

		it("should extract multi-line selection correctly", () => {
			const editor = createMockEditor({
				selection: "line 1\nline 2\nline 3",
				selections: [
					{
						anchor: {line: 2, ch: 5},
						head: {line: 4, ch: 10},
					},
				],
			});
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(editor, file);

			expect(result).not.toBeNull();
			expect(result?.range.start.line).toBe(2);
			expect(result?.range.end.line).toBe(4);
		});

		it("should handle reversed selection (head before anchor on different lines)", () => {
			const editor = createMockEditor({
				selection: "backwards",
				selections: [
					{
						anchor: {line: 10, ch: 20}, // end position
						head: {line: 5, ch: 5}, // start position
					},
				],
			});
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(editor, file);

			// Should normalize: start line should be smaller
			expect(result?.range.start.line).toBe(5);
			expect(result?.range.end.line).toBe(10);
		});

		it("should handle selection at line 0", () => {
			const editor = createMockEditor({
				selection: "first line",
				selections: [
					{
						anchor: {line: 0, ch: 0},
						head: {line: 0, ch: 10},
					},
				],
			});
			const file = createMockTFile("test.md");

			const result = strategy.extractSelection(editor, file);

			expect(result?.range.start.line).toBe(0);
			expect(result?.range.start.character).toBe(0);
		});

		it("should handle selection with zero character offset", () => {
			const editor = createMockEditor({
				selection: "text",
				selections: [
					{
						anchor: {line: 3, ch: 0},
						head: {line: 3, ch: 4},
					},
				],
			});
			const file = createMockTFile("notes/test.md");

			const result = strategy.extractSelection(editor, file);

			expect(result?.range.start.character).toBe(0);
			expect(result?.range.end.character).toBe(4);
		});
	});

	describe("getSelectedText", () => {
		it("should return the selected text", () => {
			const editor = createMockEditor({selection: "hello world"});

			const result = strategy.getSelectedText(editor);

			expect(result).toBe("hello world");
		});

		it("should return empty string when nothing is selected", () => {
			const editor = createMockEditor({selection: ""});

			const result = strategy.getSelectedText(editor);

			expect(result).toBe("");
		});

		it("should preserve newlines in multiline selection", () => {
			const multiline = "line 1\nline 2\nline 3";
			const editor = createMockEditor({selection: multiline});

			const result = strategy.getSelectedText(editor);

			expect(result).toBe(multiline);
		});
	});
});
