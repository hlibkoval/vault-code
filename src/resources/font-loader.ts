import * as path from "path";
import * as fs from "fs";

const FONT_STYLE_ID = "nerd-font-style";

/**
 * Load Nerd Font for terminal icon display.
 * Font loading is optional - terminal works without it.
 */
export async function loadNerdFont(pluginDir: string | undefined, basePath: string | undefined): Promise<void> {
	try {
		if (!pluginDir || !basePath) return;

		const fontPath = path.join(basePath, pluginDir, "symbols-nerd-font.woff2");
		if (!fs.existsSync(fontPath)) return;

		const fontData = fs.readFileSync(fontPath);
		const fontB64 = fontData.toString("base64");

		// eslint-disable-next-line obsidianmd/no-forbidden-elements -- Required for dynamic font loading
		const style = document.createElement("style");
		style.id = FONT_STYLE_ID;
		style.textContent = `
			@font-face {
				font-family: 'Symbols Nerd Font Mono';
				src: url(data:font/woff2;base64,${fontB64}) format('woff2');
				font-weight: normal;
				font-style: normal;
				font-display: swap;
			}
		`;
		document.head.appendChild(style);
	} catch {
		// Font loading is optional - terminal works without it
	}
}

/**
 * Remove injected font style element.
 */
export function unloadNerdFont(): void {
	const fontStyle = document.getElementById(FONT_STYLE_ID);
	if (fontStyle) fontStyle.remove();
}
