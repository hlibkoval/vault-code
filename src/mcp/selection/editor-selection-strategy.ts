import {Editor, TFile} from "obsidian";
import {createCodeRange} from "../mcp-notifications";
import {SelectionStrategy, SelectionResult} from "./selection-strategy";

/**
 * Selection extraction strategy for editor/source mode.
 * Uses Obsidian's Editor API to get cursor positions and selections.
 */
export class EditorSelectionStrategy extends SelectionStrategy {
	extractSelection(editor: Editor, _file: TFile): SelectionResult | null {
		const selection = editor.getSelection();
		if (!selection) {
			return null;
		}

		const sel = editor.listSelections()[0];
		if (!sel) {
			return null;
		}

		// Handle selection direction (anchor can be before or after head)
		const startLine = Math.min(sel.anchor.line, sel.head.line);
		const startCol = sel.anchor.line <= sel.head.line ? sel.anchor.ch : sel.head.ch;
		const endLine = Math.max(sel.anchor.line, sel.head.line);
		const endCol = sel.anchor.line <= sel.head.line ? sel.head.ch : sel.anchor.ch;

		return {
			range: createCodeRange(startLine, startCol, endLine, endCol),
			selectedText: selection,
		};
	}

	getSelectedText(editor: Editor): string {
		return editor.getSelection();
	}
}
