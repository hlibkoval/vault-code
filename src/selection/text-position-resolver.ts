/**
 * Position information for text in source.
 */
export interface TextPosition {
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
}

/**
 * Section position bounds from Obsidian cache.
 */
export interface SectionPosition {
	start: { offset: number };
	end: { offset: number };
}

/**
 * Find the position of text in source starting from a known index.
 * Returns line/character positions for start and end.
 */
export function findTextPositionInSource(
	source: string,
	selectedText: string,
	startIndex?: number
): TextPosition | null {
	const index = startIndex !== undefined ? startIndex : source.indexOf(selectedText);
	if (index === -1) {
		return null;
	}

	// Convert character index to line/column
	const beforeStart = source.substring(0, index);
	const startLines = beforeStart.split('\n');
	const startLine = startLines.length - 1;
	const startChar = startLines[startLines.length - 1]?.length || 0;

	const beforeEnd = source.substring(0, index + selectedText.length);
	const endLines = beforeEnd.split('\n');
	const endLine = endLines.length - 1;
	const endChar = endLines[endLines.length - 1]?.length || 0;

	return { startLine, startChar, endLine, endChar };
}

/**
 * Find text within a specific section's bounds.
 */
export function findTextInSection(
	source: string,
	selectedText: string,
	sectionPos: SectionPosition
): TextPosition | null {
	const sectionText = source.substring(sectionPos.start.offset, sectionPos.end.offset);
	const localIndex = sectionText.indexOf(selectedText);

	if (localIndex === -1) return null;

	const globalIndex = sectionPos.start.offset + localIndex;
	return findTextPositionInSource(source, selectedText, globalIndex);
}

/**
 * Find text using context before the selection for uniqueness.
 */
export function findTextWithContext(
	source: string,
	selectedText: string,
	contextBefore: string
): TextPosition | null {
	if (!contextBefore) return null;

	// Search for context + selection
	const pattern = contextBefore + selectedText;
	const index = source.indexOf(pattern);

	if (index === -1) return null;

	// The selection starts after the context
	const selectionStart = index + contextBefore.length;
	return findTextPositionInSource(source, selectedText, selectionStart);
}

/**
 * Get text content before the selection in the DOM for context matching.
 */
export function getTextBeforeSelection(
	container: HTMLElement,
	range: Range,
	maxLength: number
): string {
	// Create a range from the start of the container to the selection start
	const preRange = document.createRange();
	preRange.setStart(container, 0);
	preRange.setEnd(range.startContainer, range.startOffset);

	const text = preRange.toString();
	// Return the last maxLength characters
	return text.slice(-maxLength);
}
