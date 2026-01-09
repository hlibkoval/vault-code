import {Workspace} from "obsidian";
import {TerminalView, VIEW_TYPE} from "./terminal-view";

/**
 * Manages Claude terminal view lifecycle and focus.
 */
export class ViewManager {
	constructor(private workspace: Workspace) {}

	/**
	 * Toggle focus between editor and Claude terminal.
	 */
	async toggleFocus(): Promise<void> {
		const activeView = this.workspace.getActiveViewOfType(TerminalView);
		if (activeView) {
			// Currently in Claude, go to editor
			const leaves = this.workspace.getLeavesOfType("markdown");
			const firstLeaf = leaves[0];
			if (firstLeaf) {
				this.workspace.setActiveLeaf(firstLeaf, {focus: true});
			}
		} else {
			// Currently in editor, go to Claude
			this.focusTerminal();
		}
	}

	/**
	 * Focus the first Claude terminal.
	 */
	focusTerminal(): void {
		const claudeLeaves = this.workspace.getLeavesOfType(VIEW_TYPE);
		const firstClaudeLeaf = claudeLeaves[0];
		if (firstClaudeLeaf) {
			this.workspace.setActiveLeaf(firstClaudeLeaf, {focus: true});
			const view = firstClaudeLeaf.view;
			if (view instanceof TerminalView) {
				view.focusTerminal();
			}
		}
	}

	/**
	 * Activate existing Claude view or create a new one.
	 */
	async activateView(): Promise<void> {
		const leaves = this.workspace.getLeavesOfType(VIEW_TYPE);
		const existingLeaf = leaves[0];
		if (existingLeaf) {
			await this.workspace.revealLeaf(existingLeaf);
			return;
		}
		await this.createNewTab();
	}

	/**
	 * Create a new Claude terminal tab in the right sidebar.
	 */
	async createNewTab(): Promise<void> {
		const leaf = this.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({type: VIEW_TYPE, active: true});
			await this.workspace.revealLeaf(leaf);
		}
	}
}
