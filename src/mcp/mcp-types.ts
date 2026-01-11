/**
 * MCP (Model Context Protocol) type definitions for IDE integration.
 * Based on the JetBrains Claude Code plugin protocol.
 */

// Lock file content written to ~/.claude/ide/[port].lock
export interface LockFileContent {
	workspaceFolders: string[];
	pid: number;
	ideName: string;
	transport: "ws";
	runningInWindows: boolean;
	authToken: string;
}

// JSON-RPC 2.0 notification format
export interface JSONRPCNotification {
	jsonrpc: "2.0";
	method: string;
	params: SelectionChangedParams | AtMentionedParams;
}

// Cursor/selection position
export interface CursorPosition {
	line: number;
	character: number;
}

// Code range (start and end positions)
export interface CodeRange {
	start: CursorPosition;
	end: CursorPosition;
}

// selection_changed notification params
export interface SelectionChangedParams {
	selection: CodeRange | null;
	text: string | null;
	filePath: string | null;
}

// at_mentioned notification params
export interface AtMentionedParams {
	filePath: string;
	startLine: number | null;
	endLine: number | null;
}

// ide_connected notification params (received from Claude Code)
export interface IdeConnectedParams {
	pid: number;
	isPluginVersionUnsupported?: boolean;
}
