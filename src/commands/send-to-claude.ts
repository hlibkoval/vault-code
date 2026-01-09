import {Editor, TFile} from "obsidian";
import {INotificationSender, IVaultContext} from "../interfaces";
import {createAtMentionedNotification} from "../mcp/mcp-notifications";
import {toFileUri} from "../utils/uri-utils";

export interface SendToClaudeOptions {
	vaultContext: IVaultContext;
	notificationSender: INotificationSender;
	onComplete?: () => void;
}

/**
 * Send current selection to Claude Code as an @-mention.
 */
export function sendToClaudeCode(
	editor: Editor,
	file: TFile | null,
	options: SendToClaudeOptions
): void {
	if (!options.notificationSender.hasConnectedClients() || !file) {
		return;
	}

	const fileUri = toFileUri(options.vaultContext.getVaultPath(), file.path);
	const selection = editor.listSelections()[0];

	if (!selection) {
		// No selection, send just the file reference
		const notification = createAtMentionedNotification(fileUri, null, null);
		options.notificationSender.sendNotification(notification);
	} else {
		const startLine = selection.anchor.line;
		const endLine = selection.head.line;
		// Ensure start <= end
		const [start, end] =
			startLine <= endLine ? [startLine, endLine] : [endLine, startLine];

		const notification = createAtMentionedNotification(fileUri, start, end);
		options.notificationSender.sendNotification(notification);
	}

	// Execute callback (e.g., focus terminal)
	options.onComplete?.();
}
