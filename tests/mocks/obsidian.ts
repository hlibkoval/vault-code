import {vi} from "vitest";
import type {Editor, TFile, MarkdownPreviewView} from "obsidian";

/**
 * Create a mock Obsidian Editor with configurable selection.
 */
export function createMockEditor(
	options: {
		selection?: string;
		selections?: Array<{
			anchor: {line: number; ch: number};
			head: {line: number; ch: number};
		}>;
	} = {}
): Editor {
	const {selection = "", selections = []} = options;

	return {
		getSelection: vi.fn(() => selection),
		listSelections: vi.fn(() => selections),
		getCursor: vi.fn(() => ({line: 0, ch: 0})),
		getLine: vi.fn(() => ""),
		getValue: vi.fn(() => ""),
		setValue: vi.fn(),
		replaceSelection: vi.fn(),
	} as unknown as Editor;
}

/**
 * Create a mock TFile.
 */
export function createMockTFile(path: string): TFile {
	const parts = path.split("/");
	const name = parts[parts.length - 1] || "";
	const dotIndex = name.lastIndexOf(".");

	return {
		path,
		name,
		basename: dotIndex > 0 ? name.slice(0, dotIndex) : name,
		extension: dotIndex > 0 ? name.slice(dotIndex + 1) : "",
		vault: {} as TFile["vault"],
		parent: null,
		stat: {ctime: 0, mtime: 0, size: 0},
	} as TFile;
}

/**
 * Create a mock MarkdownPreviewView with configurable container.
 */
export function createMockPreviewView(
	containerEl: HTMLElement
): MarkdownPreviewView {
	return {
		containerEl,
		getMode: vi.fn(() => "preview"),
	} as unknown as MarkdownPreviewView;
}
