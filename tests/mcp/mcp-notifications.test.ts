import {describe, it, expect} from "vitest";
import {
	createSelectionChangedNotification,
	createAtMentionedNotification,
	createCursorPosition,
	createCodeRange,
	toFileUri,
} from "../../src/mcp/mcp-notifications";

describe("mcp-notifications", () => {
	describe("createCursorPosition", () => {
		it("should create a cursor position with line and character", () => {
			const pos = createCursorPosition(5, 10);
			expect(pos).toEqual({line: 5, character: 10});
		});

		it("should handle zero values", () => {
			const pos = createCursorPosition(0, 0);
			expect(pos).toEqual({line: 0, character: 0});
		});

		it("should handle large values", () => {
			const pos = createCursorPosition(10000, 500);
			expect(pos).toEqual({line: 10000, character: 500});
		});
	});

	describe("createCodeRange", () => {
		it("should create a code range with start and end positions", () => {
			const range = createCodeRange(1, 0, 5, 20);
			expect(range).toEqual({
				start: {line: 1, character: 0},
				end: {line: 5, character: 20},
			});
		});

		it("should handle single-line selection", () => {
			const range = createCodeRange(3, 5, 3, 15);
			expect(range.start.line).toBe(range.end.line);
			expect(range.start.character).toBe(5);
			expect(range.end.character).toBe(15);
		});

		it("should handle zero-length selection (cursor position)", () => {
			const range = createCodeRange(7, 12, 7, 12);
			expect(range.start).toEqual(range.end);
		});
	});

	describe("createSelectionChangedNotification", () => {
		it("should create a valid JSON-RPC 2.0 notification", () => {
			const range = createCodeRange(0, 0, 1, 10);
			const notification = createSelectionChangedNotification(
				"file:///path/to/file.md",
				range,
				"selected text"
			);

			expect(notification.jsonrpc).toBe("2.0");
			expect(notification.method).toBe("selection_changed");
			expect(notification.params).toEqual({
				selection: range,
				text: "selected text",
				filePath: "file:///path/to/file.md",
			});
		});

		it("should handle null selection (deselection)", () => {
			const notification = createSelectionChangedNotification(
				null,
				null,
				null
			);

			expect(notification.params).toEqual({
				selection: null,
				text: null,
				filePath: null,
			});
		});

		it("should handle null filePath with valid selection", () => {
			const range = createCodeRange(0, 0, 0, 5);
			const notification = createSelectionChangedNotification(
				null,
				range,
				"text"
			);

			expect(notification.params.filePath).toBeNull();
			expect(notification.params.selection).toBe(range);
			expect(notification.params.text).toBe("text");
		});

		it("should handle empty selected text", () => {
			const range = createCodeRange(2, 5, 2, 5);
			const notification = createSelectionChangedNotification(
				"file:///test.md",
				range,
				""
			);

			expect(notification.params.text).toBe("");
		});

		it("should handle multiline selected text", () => {
			const range = createCodeRange(0, 0, 2, 10);
			const multilineText = "line 1\nline 2\nline 3";
			const notification = createSelectionChangedNotification(
				"file:///test.md",
				range,
				multilineText
			);

			expect(notification.params.text).toBe(multilineText);
		});
	});

	describe("createAtMentionedNotification", () => {
		it("should create a valid at_mentioned notification", () => {
			const notification = createAtMentionedNotification(
				"file:///path/to/file.md",
				10,
				20
			);

			expect(notification.jsonrpc).toBe("2.0");
			expect(notification.method).toBe("at_mentioned");
			expect(notification.params).toEqual({
				filePath: "file:///path/to/file.md",
				startLine: 10,
				endLine: 20,
			});
		});

		it("should handle null line numbers (whole file reference)", () => {
			const notification = createAtMentionedNotification(
				"file:///path/to/file.md",
				null,
				null
			);

			expect(notification.params.startLine).toBeNull();
			expect(notification.params.endLine).toBeNull();
			expect(notification.params.filePath).toBe("file:///path/to/file.md");
		});

		it("should handle single line selection", () => {
			const notification = createAtMentionedNotification(
				"file:///test.md",
				5,
				5
			);

			expect(notification.params.startLine).toBe(5);
			expect(notification.params.endLine).toBe(5);
		});

		it("should handle startLine only (endLine null)", () => {
			const notification = createAtMentionedNotification(
				"file:///test.md",
				3,
				null
			);

			expect(notification.params.startLine).toBe(3);
			expect(notification.params.endLine).toBeNull();
		});
	});

	describe("toFileUri", () => {
		it("should convert vault path and relative path to file:// URI", () => {
			const uri = toFileUri("/Users/test/vault", "notes/file.md");
			expect(uri).toBe("file:///Users/test/vault/notes/file.md");
		});

		it("should handle empty vault path", () => {
			const uri = toFileUri("", "notes/file.md");
			expect(uri).toBe("file://notes/file.md");
		});

		it("should handle paths with spaces", () => {
			const uri = toFileUri("/Users/test/My Vault", "my notes/file.md");
			expect(uri).toBe("file:///Users/test/My Vault/my notes/file.md");
		});

		it("should handle simple file in vault root", () => {
			const uri = toFileUri("/vault", "readme.md");
			expect(uri).toBe("file:///vault/readme.md");
		});

		it("should handle deeply nested paths", () => {
			const uri = toFileUri(
				"/home/user/docs",
				"projects/2024/january/notes.md"
			);
			expect(uri).toBe(
				"file:///home/user/docs/projects/2024/january/notes.md"
			);
		});
	});
});
