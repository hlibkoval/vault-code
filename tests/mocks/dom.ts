import {LINE_START_ATTR, LINE_END_ATTR} from "../../src/mcp/line-marker-processor";

/**
 * Create a DOM element with line marker attributes.
 */
export function createMarkedElement(
	tag: string,
	text: string,
	lineStart: number,
	lineEnd: number
): HTMLElement {
	const el = document.createElement(tag);
	el.textContent = text;
	el.setAttribute(LINE_START_ATTR, String(lineStart));
	el.setAttribute(LINE_END_ATTR, String(lineEnd));
	return el;
}

/**
 * Create and set a DOM selection.
 */
export function setSelection(
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

/**
 * Clear all selections.
 */
export function clearSelection(): void {
	window.getSelection()?.removeAllRanges();
}
