import type { ITheme } from "@xterm/xterm";

export function getThemeColors(): ITheme {
	const styles = getComputedStyle(document.body);
	const bg = styles.getPropertyValue("--background-secondary").trim() || "#1e1e1e";
	const fg = styles.getPropertyValue("--text-normal").trim() || "#d4d4d4";
	const cursor = styles.getPropertyValue("--text-accent").trim() || "#ffffff";
	return { background: bg, foreground: fg, cursor: cursor };
}
