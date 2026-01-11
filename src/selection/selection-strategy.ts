import {EditorPosition, TFile} from "obsidian";
import {CodeRange} from "../mcp/mcp-types";
import {createCodeRange} from "../mcp/mcp-notifications";

/**
 * Result of extracting selection from a view.
 */
export interface SelectionResult {
	range: CodeRange;
	selectedText: string;
}

/**
 * Empty range constant for when there's no selection.
 */
export const EMPTY_RANGE: CodeRange = {
	start: {line: 0, character: 0},
	end: {line: 0, character: 0},
};

/**
 * Abstract base class for selection extraction strategies.
 * Each view mode (editor, preview) has its own concrete strategy.
 */
export abstract class SelectionStrategy {
	/**
	 * Extract current selection from the view.
	 * Returns null if no selection exists.
	 */
	abstract extract(view: unknown, file: TFile): SelectionResult | null;

	/**
	 * Get the selected text without full extraction (for deduplication checks).
	 */
	abstract getSelectedText(view: unknown): string;

	/**
	 * Get cursor position for deduplication (null if not applicable).
	 */
	abstract getCursor(view: unknown): EditorPosition | null;

	/**
	 * Helper to create a CodeRange.
	 */
	protected createRange(
		startLine: number,
		startCol: number,
		endLine: number,
		endCol: number
	): CodeRange {
		return createCodeRange(startLine, startCol, endLine, endCol);
	}
}
