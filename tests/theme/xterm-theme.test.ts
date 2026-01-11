import {describe, it, expect, beforeEach} from "vitest";
import {hexToRgba, getThemeColors} from "../../src/theme/xterm-theme";

describe("xterm-theme", () => {
	describe("hexToRgba", () => {
		it("should convert 6-digit hex to rgba", () => {
			expect(hexToRgba("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
		});

		it("should handle hex without # prefix", () => {
			expect(hexToRgba("00ff00", 0.8)).toBe("rgba(0, 255, 0, 0.8)");
		});

		it("should handle lowercase hex", () => {
			expect(hexToRgba("#abcdef", 1)).toBe("rgba(171, 205, 239, 1)");
		});

		it("should handle uppercase hex", () => {
			expect(hexToRgba("#ABCDEF", 0.3)).toBe("rgba(171, 205, 239, 0.3)");
		});

		it("should pass through rgb() values unchanged", () => {
			expect(hexToRgba("rgb(100, 200, 50)", 0.5)).toBe("rgb(100, 200, 50)");
		});

		it("should pass through rgba() values unchanged", () => {
			expect(hexToRgba("rgba(100, 200, 50, 0.3)", 0.9)).toBe(
				"rgba(100, 200, 50, 0.3)"
			);
		});

		it("should return fallback for invalid hex", () => {
			expect(hexToRgba("invalid", 0.4)).toBe("rgba(124, 58, 237, 0.4)");
		});

		it("should return fallback for short hex (3-digit)", () => {
			// Current implementation doesn't handle 3-digit hex
			expect(hexToRgba("#fff", 0.4)).toBe("rgba(124, 58, 237, 0.4)");
		});

		it("should return fallback for empty string", () => {
			expect(hexToRgba("", 0.5)).toBe("rgba(124, 58, 237, 0.5)");
		});

		it("should handle zero alpha", () => {
			expect(hexToRgba("#000000", 0)).toBe("rgba(0, 0, 0, 0)");
		});

		it("should handle full alpha", () => {
			expect(hexToRgba("#ffffff", 1)).toBe("rgba(255, 255, 255, 1)");
		});
	});

	describe("getThemeColors", () => {
		beforeEach(() => {
			// Reset document.body for happy-dom
			document.body.removeAttribute("style");
		});

		it("should return theme object with required properties", () => {
			document.body.style.setProperty("--background-secondary", "#1e1e1e");
			document.body.style.setProperty("--text-normal", "#d4d4d4");
			document.body.style.setProperty("--text-accent", "#ffffff");
			document.body.style.setProperty("--interactive-accent", "#7c3aed");

			const theme = getThemeColors();

			expect(theme).toHaveProperty("background");
			expect(theme).toHaveProperty("foreground");
			expect(theme).toHaveProperty("cursor");
			expect(theme).toHaveProperty("selectionBackground");
		});

		it("should extract colors from CSS variables", () => {
			document.body.style.setProperty("--background-secondary", "#282828");
			document.body.style.setProperty("--text-normal", "#ebdbb2");
			document.body.style.setProperty("--text-accent", "#fe8019");
			document.body.style.setProperty("--interactive-accent", "#b8bb26");

			const theme = getThemeColors();

			expect(theme.background).toBe("#282828");
			expect(theme.foreground).toBe("#ebdbb2");
			expect(theme.cursor).toBe("#fe8019");
			expect(theme.selectionBackground).toBe("rgba(184, 187, 38, 0.4)");
		});

		it("should use fallback colors when CSS variables are empty", () => {
			// Don't set any CSS variables
			const theme = getThemeColors();

			expect(theme.background).toBe("#1e1e1e");
			expect(theme.foreground).toBe("#d4d4d4");
			expect(theme.cursor).toBe("#ffffff");
		});

		it("should handle rgb accent color passthrough", () => {
			document.body.style.setProperty("--background-secondary", "#1e1e1e");
			document.body.style.setProperty("--text-normal", "#d4d4d4");
			document.body.style.setProperty("--text-accent", "#ffffff");
			document.body.style.setProperty(
				"--interactive-accent",
				"rgb(100, 50, 200)"
			);

			const theme = getThemeColors();

			// rgb() values should pass through unchanged
			expect(theme.selectionBackground).toBe("rgb(100, 50, 200)");
		});
	});
});
