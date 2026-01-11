/**
 * MCP notification builders for IDE integration.
 * Creates JSON-RPC 2.0 notifications for selection changes and file references.
 */

import type {
	JSONRPCNotification,
	SelectionChangedParams,
	AtMentionedParams,
	CursorPosition,
	CodeRange,
} from "./mcp-types";

/**
 * Create a selection_changed notification.
 * Sent when the user's selection changes in the editor.
 */
export function createSelectionChangedNotification(
	filePath: string | null,
	selection: CodeRange | null,
	selectedText: string | null
): JSONRPCNotification {
	const params: SelectionChangedParams = {
		selection,
		text: selectedText,
		filePath,
	};

	console.debug(`Selection changed: `, params);

	return {
		jsonrpc: "2.0",
		method: "selection_changed",
		params,
	};
}

/**
 * Create an at_mentioned notification.
 * Sent when the user explicitly triggers "Send to Claude" (Cmd+Option+K).
 */
export function createAtMentionedNotification(
	filePath: string,
	startLine: number | null,
	endLine: number | null
): JSONRPCNotification {
	const params: AtMentionedParams = {
		filePath,
		startLine,
		endLine,
	};

	return {
		jsonrpc: "2.0",
		method: "at_mentioned",
		params,
	};
}

/**
 * Helper to create a CursorPosition from line and character numbers.
 * Note: Obsidian uses 0-based line numbers, which matches the MCP protocol.
 */
export function createCursorPosition(
	line: number,
	character: number
): CursorPosition {
	return { line, character };
}

/**
 * Helper to create a CodeRange from start and end positions.
 */
export function createCodeRange(
	startLine: number,
	startColumn: number,
	endLine: number,
	endColumn: number
): CodeRange {
	return {
		start: createCursorPosition(startLine, startColumn),
		end: createCursorPosition(endLine, endColumn),
	};
}

/**
 * Convert relative Obsidian path to file:// URI.
 * MCP protocol requires file:// URI format for file paths.
 */
export function toFileUri(vaultPath: string, relativePath: string): string {
	if (vaultPath) {
		return `file://${vaultPath}/${relativePath}`;
	}
	return `file://${relativePath}`;
}
