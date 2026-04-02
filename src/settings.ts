import {App, PluginSettingTab, Setting} from "obsidian";
import type VaultCodePlugin from "./main";
import {VIEW_TYPE} from "./view/terminal-view";

export interface VaultCodeSettings {
	mcpEnabled: boolean;
	continueLastConversation: boolean;
	customEnvVars: string;
}

export const DEFAULT_SETTINGS: VaultCodeSettings = {
	mcpEnabled: true,
	continueLastConversation: false,
	customEnvVars: "",
};

export class VaultCodeSettingTab extends PluginSettingTab {
	plugin: VaultCodePlugin;
	icon: string = "bot";

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
			.setDesc("Send current file and selection changes to Claude Code via IDE MCP integration (--ide flag). Enable \"Send to Claude Code\" context menu.")
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
			.setName("Continue the last conversation")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
			.setDesc("Pass --continue flag to the first started Claude Code, resuming the previous conversation.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.continueLastConversation)
					.onChange(async (value) => {
						this.plugin.settings.continueLastConversation = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Custom environment variables")
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- Claude Code is a brand name
			.setDesc("Set environment variables for the Claude Code process. Use KEY=VALUE format, one per line. Lines starting with # are ignored. Takes effect on next terminal open.")
			.addTextArea((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- placeholder with env var syntax
					.setPlaceholder("# Example:\n# CLAUDE_CODE_FEATURE=1\nMY_VAR=value")
					.setValue(this.plugin.settings.customEnvVars)
					.onChange(async (value) => {
						this.plugin.settings.customEnvVars = value;
						await this.plugin.saveSettings();
					})
			)
			.then((setting) => {
				setting.settingEl.addClass("vault-code-env-setting");
				const textarea = setting.controlEl.querySelector("textarea");
				if (textarea) {
					textarea.addClass("vault-code-env-textarea");
					textarea.rows = 6;
				}
			});
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
