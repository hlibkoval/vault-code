import {JSONRPCNotification} from "../mcp-types";

/**
 * Interface for sending MCP notifications to Claude Code.
 * Abstracts the MCP server from components that need to send notifications.
 */
export interface INotificationSender {
	sendNotification(notification: JSONRPCNotification): void;
	hasConnectedClients(): boolean;
}
