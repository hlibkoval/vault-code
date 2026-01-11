import {defineConfig} from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		environment: "happy-dom",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["./tests/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			reportsDirectory: "./coverage",
			include: ["src/**/*.ts"],
			exclude: [
				// Plugin lifecycle - integration test scope
				"src/main.ts",
				"src/settings.ts",
				// PTY scripts - generated base64 constants, no logic
				"src/terminal/pty-scripts.ts",
				// Font loading - browser-only
				"src/resources/**",
				// Type definitions - no logic
				"src/mcp/mcp-types.ts",
				// Re-export barrel - no logic
				"src/mcp/selection/index.ts",
				// Terminal view - xterm.js/DOM complexity, deferred
				"src/view/terminal-view.ts",
				// Theme CSS injection - runtime only
				"src/theme/xterm-css.ts",
				// Interface definitions - no logic
				"src/interfaces/**",
			],
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 90,
				lines: 90,
			},
		},
		testTimeout: 5000,
	},
	resolve: {
		alias: {
			// Alias obsidian to our mock module
			obsidian: path.resolve(__dirname, "tests/mocks/obsidian-module.ts"),
		},
	},
});
