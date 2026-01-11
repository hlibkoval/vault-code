import {Editor, MarkdownPreviewView, TFile} from "obsidian";
import {CodeRange} from "../mcp-types";

/**
 * Supported view types for selection extraction.
 */
export type SelectionView = Editor | MarkdownPreviewView;

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
	abstract extractSelection(view: SelectionView, file: TFile): SelectionResult | null;

	/**
	 * Get the selected text (or empty string) without full extraction (for deduplication checks).
	 */
	abstract getSelectedText(view: SelectionView): string;
}
