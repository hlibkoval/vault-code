import {App, MarkdownPreviewView} from "obsidian";
import {LINE_END_ATTR, LINE_START_ATTR} from "../markdown/line-marker-processor";

export interface PreviewSelectionResult {
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
	selectedText: string;
}

interface LineMarker {
	lineStart: number;
	lineEnd: number;
}

type PositionInSource = { startLine: number; startChar: number; endLine: number; endChar: number };

/**
 * Extracts selection position from markdown preview mode.
 * Uses line marker attributes added by registerLineMarkerProcessor
 * to map preview selection back to source positions.
 */
export class PreviewSelectionExtractor {
	constructor(_app: App) {} // App preserved for API compatibility

	/**
	 * Extract selection position from preview mode.
	 * Returns null if no selection or position cannot be determined.
	 */
	async extract(preview: MarkdownPreviewView): Promise<PreviewSelectionResult | null> {
		const selectionObj = this.getSelectionInElement(preview.containerEl);
		const selectedText = selectionObj?.toString() || "";

		if (!selectionObj || selectionObj.isCollapsed || !selectedText) {
			return null;
		}

		const position = this.findPositionInSource(selectionObj, selectedText);

		if (!position) return null;

		return {
			...position,
			selectedText,
		};
	}

	/**
	 * Check if there is any selection in the preview element.
	 */
	hasSelection(preview: MarkdownPreviewView): boolean {
		const selectionObj = this.getSelectionInElement(preview.containerEl);
		return !!(selectionObj && !selectionObj.isCollapsed && selectionObj.toString());
	}

	/**
	 * Get the selected text from the preview element, or empty string if none.
	 */
	getSelectedText(preview: MarkdownPreviewView): string {
		const selectionObj = this.getSelectionInElement(preview.containerEl);
		return selectionObj?.toString() || "";
	}

	private findPositionInSource(selectionObj: Selection, selectedText: string): PositionInSource | null {
		const range = selectionObj.getRangeAt(0);
		const startMarker = this.findMarkerFromNode(range.startContainer);
		const match = selectedText.match(/^.*$/gm);

		if (!match || match.length < 1 || !startMarker) return null;

		let endOffset = range.endOffset;
		let endLine = startMarker.lineStart + match.length - 1;

		// drop empty lines at the end
		for (let i = match.length - 1; i >= 0; i--) {
			const curMatch = match[i];
			if (!curMatch || curMatch.length === 0) {
				endLine--;
			} else {
				endOffset = curMatch.length - 1;
				break;
			}
		}

		return {
			startLine: startMarker.lineStart,
			startChar: range.startOffset,
			endLine: endLine,
			endChar: endOffset,
		};
	}

	/**
	 * Find line marker attributes by traversing up from a node.
	 */
	private findMarkerFromNode(node: Node): LineMarker | null {
		let el: HTMLElement | null = node.nodeType === Node.ELEMENT_NODE
			? node as HTMLElement
			: node.parentElement;

		while (el && !el.hasAttribute(LINE_START_ATTR)) {
			el = el.parentElement;
		}

		if (!el) return null;

		const lineStartAttr = el.getAttribute(LINE_START_ATTR);
		const lineEndAttr = el.getAttribute(LINE_END_ATTR);
		if (!lineStartAttr || !lineEndAttr) return null;

		return {
			lineStart: parseInt(lineStartAttr, 10),
			lineEnd: parseInt(lineEndAttr, 10),
		};
	}

	/**
	 * Get selection object if it's within the specified element.
	 */
	private getSelectionInElement(parentElement: HTMLElement): Selection | null {
		const selection = window.getSelection();

		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);

			if (parentElement && parentElement.contains(range.commonAncestorContainer)) {
				return selection;
			}
		}

		return null;
	}

}
