import {App, MarkdownPreviewView, TFile} from "obsidian";
import {findTextInSection, findTextPositionInSource, findTextWithContext, getTextBeforeSelection} from "./text-position-resolver";

export interface PreviewSelectionResult {
	startLine: number;
	startChar: number;
	endLine: number;
	endChar: number;
	selectedText: string;
}

/**
 * Extracts selection position from markdown preview mode.
 * Uses DOM structure and section cache to map preview selection back to source positions.
 */
export class PreviewSelectionExtractor {
	constructor(private app: App) {}

	/**
	 * Extract selection position from preview mode.
	 * Returns null if no selection or position cannot be determined.
	 */
	async extract(preview: MarkdownPreviewView, file: TFile): Promise<PreviewSelectionResult | null> {
		const selectionObj = this.getSelectionInElement(preview.containerEl);
		const selectedText = selectionObj?.toString() || "";

		if (!selectionObj || selectionObj.isCollapsed || !selectedText) {
			return null;
		}

		const source = await this.app.vault.cachedRead(file);
		const position = this.findPositionInSource(preview, file, selectionObj, selectedText, source);

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

	private findPositionInSource(
		preview: MarkdownPreviewView,
		file: TFile,
		selectionObj: Selection,
		selectedText: string,
		source: string,
	): {startLine: number; startChar: number; endLine: number; endChar: number} | null {
		const range = selectionObj.getRangeAt(0);
		const cache = this.app.metadataCache.getFileCache(file);
		const sections = cache?.sections || [];

		// Try section-based matching first for precision
		const sectionIndex = this.findSectionIndexFromDOM(preview.containerEl, range, file);
		if (sectionIndex !== -1 && sectionIndex < sections.length) {
			const section = sections[sectionIndex];
			if (section) {
				const pos = findTextInSection(source, selectedText, section.position);
				if (pos) return pos;
			}
		}

		// Fallback: use context-based matching for uniqueness
		const contextBefore = getTextBeforeSelection(preview.containerEl, range, 30);
		const pos = findTextWithContext(source, selectedText, contextBefore);
		if (pos) return pos;

		// Last resort: simple indexOf (first match)
		return findTextPositionInSource(source, selectedText, 0);
	}

	/**
	 * Find which section index corresponds to the DOM selection.
	 * Returns -1 if not found.
	 */
	private findSectionIndexFromDOM(container: HTMLElement, range: Range, file: TFile): number {
		// Get all block-level elements that correspond to sections
		const blockSelector = ".el-p, .el-h1, .el-h2, .el-h3, .el-h4, .el-h5, .el-h6, .el-code, .el-blockquote, .el-table, .el-ul, .el-ol";
		const blockElements = Array.from(container.querySelectorAll(blockSelector));

		// Find which block element contains the selection
		let selectedBlock: Element | null = null;
		for (const el of blockElements) {
			if (el.contains(range.commonAncestorContainer)) {
				selectedBlock = el;
				break;
			}
		}

		if (!selectedBlock) return -1;

		// Find the index of this block among all blocks
		const blockIndex = blockElements.indexOf(selectedBlock);

		// Account for frontmatter (yaml section) which doesn't render in preview
		// The sections array includes frontmatter as the first section if present
		const cache = this.app.metadataCache.getFileCache(file);
		const hasFrontmatter = cache?.frontmatter !== undefined;

		return hasFrontmatter ? blockIndex + 1 : blockIndex;
	}

	private getSelectionInElement(parentElement: HTMLElement): Selection | null {
		const selection = window.getSelection();

		// Check if any text is actually selected
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);

			// Check if the selected range is contained within the specific element
			if (parentElement && parentElement.contains(range.commonAncestorContainer)) {
				return selection;
			}
		}

		return null;
	}
}
