import { Plugin } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import { TerminalView, VIEW_TYPE } from "./terminal-view";

export default class VaultCodePlugin extends Plugin {
	async onload(): Promise<void> {
		await this.loadNerdFont();

		this.registerView(VIEW_TYPE, (leaf) => new TerminalView(leaf, this));

		// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
		this.addRibbonIcon("bot", "Open Claude", () => void this.activateView());

		this.addCommand({
			id: "open-claude",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Open Claude code",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "new-claude-tab",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "New Claude tab",
			callback: () => void this.createNewTab(),
		});

		this.addCommand({
			id: "close-claude-tab",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Close Claude tab",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(TerminalView);
				if (view) {
					if (!checking) view.leaf.detach();
					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "toggle-claude-focus",
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude is a brand name
			name: "Toggle focus: Editor ↔ Claude",
			callback: () => void this.toggleFocus(),
		});
	}

	private async toggleFocus(): Promise<void> {
		const activeView = this.app.workspace.getActiveViewOfType(TerminalView);
		if (activeView) {
			// Currently in Claude, go to editor
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			const firstLeaf = leaves[0];
			if (firstLeaf) {
				this.app.workspace.setActiveLeaf(firstLeaf, { focus: true });
			}
		} else {
			// Currently in editor, go to Claude
			const claudeLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
			const firstClaudeLeaf = claudeLeaves[0];
			if (firstClaudeLeaf) {
				this.app.workspace.setActiveLeaf(firstClaudeLeaf, { focus: true });
				// Focus the terminal
				const view = firstClaudeLeaf.view;
				if (view instanceof TerminalView) {
					view.focusTerminal();
				}
			}
		}
	}

	onunload(): void {
		// Don't detach leaves - Obsidian manages leaf lifecycle during plugin updates
		// Remove injected font style
		const fontStyle = document.getElementById("nerd-font-style");
		if (fontStyle) fontStyle.remove();
	}

	private async loadNerdFont(): Promise<void> {
		try {
			const pluginDir = this.manifest?.dir;
			const basePath = (this.app.vault.adapter as { basePath?: string })?.basePath;
			if (!pluginDir || !basePath) return;

			const fontPath = path.join(basePath, pluginDir, "symbols-nerd-font.woff2");
			if (!fs.existsSync(fontPath)) return;

			const fontData = fs.readFileSync(fontPath);
			const fontB64 = fontData.toString("base64");

			// eslint-disable-next-line obsidianmd/no-forbidden-elements -- Required for dynamic font loading
			const style = document.createElement("style");
			style.id = "nerd-font-style";
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

	getVaultPath(): string {
		const adapter = this.app.vault.adapter as { basePath?: string };
		return adapter.basePath || "";
	}

	private async activateView(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		const existingLeaf = leaves[0];
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}
		await this.createNewTab();
	}

	private async createNewTab(): Promise<void> {
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
			await this.app.workspace.revealLeaf(leaf);
		}
	}
}
