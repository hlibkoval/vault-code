import type { ITheme } from "@xterm/xterm";

export function getThemeColors(): ITheme {
	const styles = getComputedStyle(document.body);
	const bg = styles.getPropertyValue("--background-secondary").trim() || "#1e1e1e";
	const fg = styles.getPropertyValue("--text-normal").trim() || "#d4d4d4";
	const cursor = styles.getPropertyValue("--text-accent").trim() || "#ffffff";
	// Use interactive-accent with alpha for selection - visible in both light and dark themes
	const accent = styles.getPropertyValue("--interactive-accent").trim() || "#7c3aed";
	const selection = hexToRgba(accent, 0.4);
	return {
		background: bg,
		foreground: fg,
		cursor: cursor,
		selectionBackground: selection,
	};
}

export function hexToRgba(hex: string, alpha: number): string {
	// Handle rgb/rgba passthrough
	if (hex.startsWith("rgb")) return hex;
	// Parse hex color
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!result || !result[1] || !result[2] || !result[3]) {
		return `rgba(124, 58, 237, ${alpha})`;
	}
	const r = parseInt(result[1], 16);
	const g = parseInt(result[2], 16);
	const b = parseInt(result[3], 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
