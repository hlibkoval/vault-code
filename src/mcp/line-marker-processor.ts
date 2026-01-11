import {MarkdownPostProcessorContext, Plugin} from "obsidian";

// data-vault-code-line-start
export const LINE_START_ATTR = "dvcls";
// data-vault-code-line-end
export const LINE_END_ATTR = "dvcle";

/**
 * Registers a markdown post processor that adds line number attributes
 * to rendered block elements. This enables PreviewSelectionStrategy
 * to map DOM selections back to source line numbers.
 *
 * @param plugin - The Obsidian plugin instance
 * @param isEnabled - Callback that returns whether line markers should be added
 */
export function registerLineMarkerProcessor(
	plugin: Plugin,
	isEnabled: () => boolean
): void {
	plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		if (!isEnabled()) return;

		const sectionInfo = ctx.getSectionInfo(el);
		if (sectionInfo) {
			el.setAttribute(LINE_START_ATTR, String(sectionInfo.lineStart));
			el.setAttribute(LINE_END_ATTR, String(sectionInfo.lineEnd));
		}
	});
}
