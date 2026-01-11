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
				// PTY - requires real Node child processes
				"src/terminal/**",
				// Font loading - browser-only
				"src/resources/**",
				// MCP integration facade - P3
				"src/mcp/mcp-integration.ts",
				"src/mcp/mcp-types.ts",
				// Selection tracker - polling complexity, P3
				"src/mcp/selection/selection-tracker.ts",
				"src/mcp/selection/index.ts",
				// View manager - Obsidian workspace integration, P3
				"src/view/terminal-view.ts",
				"src/view/view-manager.ts",
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
