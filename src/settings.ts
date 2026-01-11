import {App, PluginSettingTab, Setting} from "obsidian";
import type VaultCodePlugin from "./main";
import {VIEW_TYPE} from "./view/terminal-view";

export interface VaultCodeSettings {
	mcpEnabled: boolean;
	continueLastConversation: boolean;
}

export const DEFAULT_SETTINGS: VaultCodeSettings = {
	mcpEnabled: true,
	continueLastConversation: false,
};

export class VaultCodeSettingTab extends PluginSettingTab {
	plugin: VaultCodePlugin;
	private hintEl: HTMLElement | null = null;

	constructor(app: App, plugin: VaultCodePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		const setting = new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
			.setName("Send Obsidian context to Claude Code")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
			.setDesc("Enables MCP integration (--ide flag). Sends selection changes to Claude Code via WebSocket. Enables \"Send to Claude Code\" context menu.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.mcpEnabled)
					.onChange(async (value) => {
						const wasDisabled = !this.plugin.settings.mcpEnabled;
						this.plugin.settings.mcpEnabled = value;
						await this.plugin.saveSettings();
						await this.plugin.applyMcpSetting(value);

						// Show hint if switched ON and Claude sidebar is open
						if (value && wasDisabled && this.isClaudeSidebarOpen()) {
							this.showHint(setting.descEl);
						} else {
							this.hideHint();
						}
					})
			);

		new Setting(containerEl)
			.setName("Continue last conversation")
			.setDesc("Passes --continue flag to first opened sidebar, resuming the previous conversation.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.continueLastConversation)
					.onChange(async (value) => {
						this.plugin.settings.continueLastConversation = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private isClaudeSidebarOpen(): boolean {
		return this.app.workspace.getLeavesOfType(VIEW_TYPE).length > 0;
	}

	private showHint(descEl: HTMLElement): void {
		if (this.hintEl) return;
		this.hintEl = descEl.createDiv({cls: "mod-warning", text: "Open new Claude Code sidebar or run /ide to connect to the existing session"});
	}

	private hideHint(): void {
		this.hintEl?.remove();
		this.hintEl = null;
	}
}
