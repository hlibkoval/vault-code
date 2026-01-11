/**
 * Mock module for the 'obsidian' package.
 * This provides minimal stubs for types and classes used in tests.
 */

export class Plugin {}

export class ItemView {}

export class PluginSettingTab {}

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "";
	vault = {} as unknown;
	parent = null;
	stat = {ctime: 0, mtime: 0, size: 0};
}

export class Editor {}

export class MarkdownPreviewView {
	containerEl: HTMLElement = document.createElement("div");
}

export class MarkdownPostProcessorContext {}

export class Scope {}

// Types (these are just for TypeScript compilation)
export interface EditorPosition {
	line: number;
	ch: number;
}

export interface EditorRange {
	from: EditorPosition;
	to: EditorPosition;
}

export interface EditorSelection {
	anchor: EditorPosition;
	head: EditorPosition;
}
