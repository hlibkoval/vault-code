import {INotificationSender} from "../interfaces";
import {JSONRPCNotification} from "./mcp-types";
import {MCPServer} from "./mcp-server";
import {cleanupStaleLockFiles} from "./mcp-lock-file";

export interface MCPIntegrationOptions {
	vaultPath: string;
	onInitialized?: () => void;
	onConnected?: () => void;
	onDisconnected?: () => void;
}

/**
 * Facade for MCP server integration.
 * Implements INotificationSender for use by other components.
 */
export class MCPIntegration implements INotificationSender {
	private mcpServer: MCPServer | null = null;
	private options: MCPIntegrationOptions;

	constructor(options: MCPIntegrationOptions) {
		this.options = options;
	}

	/**
	 * Start the MCP server.
	 */
	async start(): Promise<void> {
		try {
			if (!this.options.vaultPath) {
				return;
			}

			// Clean up stale lock files from previous sessions
			cleanupStaleLockFiles(this.options.vaultPath);

			this.mcpServer = new MCPServer({
				vaultPath: this.options.vaultPath,
				onInitialized: this.options.onInitialized,
				onConnected: this.options.onConnected,
				onDisconnected: this.options.onDisconnected,
			});

			await this.mcpServer.start();
		} catch (err) {
			console.error("MCP: Failed to start server:", err);
		}
	}

	/**
	 * Stop the MCP server.
	 */
	stop(): void {
		this.mcpServer?.stop();
		this.mcpServer = null;
	}

	/**
	 * Send a notification to connected clients.
	 */
	sendNotification(notification: JSONRPCNotification): void {
		this.mcpServer?.sendNotification(notification);
	}

	/**
	 * Check if there are connected clients.
	 */
	hasConnectedClients(): boolean {
		return this.mcpServer?.hasConnectedClients() ?? false;
	}
}
