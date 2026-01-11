/**
 * WebSocket test utilities for MCPServer integration tests.
 */
import WebSocket from "ws";

export interface JSONRPCResponse {
	jsonrpc: string;
	id?: number;
	result?: object;
	error?: {
		code: number;
		message: string;
	};
	method?: string;
	params?: object;
}

/**
 * Create a WebSocket client connected to the MCP server.
 */
export function createTestClient(
	port: number,
	authToken: string,
	path: string = "/mcp"
): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, "mcp", {
			headers: { "x-claude-code-ide-authorization": authToken },
		});

		const timeout = setTimeout(() => {
			ws.terminate();
			reject(new Error("Connection timeout"));
		}, 5000);

		ws.on("open", () => {
			clearTimeout(timeout);
			resolve(ws);
		});

		ws.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
}

/**
 * Create a WebSocket client without protocol header (for testing rejection).
 */
export function createClientWithoutProtocol(
	port: number,
	authToken: string
): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/mcp`, {
			headers: { "x-claude-code-ide-authorization": authToken },
		});

		const timeout = setTimeout(() => {
			ws.terminate();
			reject(new Error("Connection timeout"));
		}, 5000);

		ws.on("open", () => {
			clearTimeout(timeout);
			resolve(ws);
		});

		ws.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
}

/**
 * Create a WebSocket client with invalid auth (for testing rejection).
 */
export function createClientWithInvalidAuth(port: number): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/mcp`, "mcp", {
			headers: { "x-claude-code-ide-authorization": "invalid-token" },
		});

		const timeout = setTimeout(() => {
			ws.terminate();
			reject(new Error("Connection timeout"));
		}, 5000);

		ws.on("open", () => {
			clearTimeout(timeout);
			resolve(ws);
		});

		ws.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
	});
}

/**
 * Send a JSON-RPC request and wait for the response.
 */
export function sendJsonRpc(
	ws: WebSocket,
	method: string,
	id: number,
	params?: object
): Promise<JSONRPCResponse> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`JSON-RPC timeout for method: ${method}`));
		}, 5000);

		const handler = (data: WebSocket.RawData) => {
			try {
				const response = JSON.parse(data.toString()) as JSONRPCResponse;
				// Only resolve if this is the response to our request
				if (response.id === id) {
					clearTimeout(timeout);
					ws.off("message", handler);
					resolve(response);
				}
			} catch (err) {
				clearTimeout(timeout);
				ws.off("message", handler);
				reject(err);
			}
		};

		ws.on("message", handler);
		ws.send(JSON.stringify({ jsonrpc: "2.0", method, id, params }));
	});
}

/**
 * Send a JSON-RPC notification (no response expected).
 */
export function sendNotification(
	ws: WebSocket,
	method: string,
	params?: object
): void {
	ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
}

/**
 * Wait for the next message from the server.
 */
export function waitForMessage(
	ws: WebSocket,
	timeout: number = 5000
): Promise<JSONRPCResponse> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("Timeout waiting for message"));
		}, timeout);

		ws.once("message", (data: WebSocket.RawData) => {
			clearTimeout(timer);
			try {
				resolve(JSON.parse(data.toString()) as JSONRPCResponse);
			} catch (err) {
				reject(err);
			}
		});
	});
}

/**
 * Wait for multiple messages.
 */
export function collectMessages(
	ws: WebSocket,
	count: number,
	timeout: number = 5000
): Promise<JSONRPCResponse[]> {
	return new Promise((resolve, reject) => {
		const messages: JSONRPCResponse[] = [];

		const timer = setTimeout(() => {
			ws.off("message", handler);
			reject(new Error(`Timeout: received ${messages.length} of ${count} messages`));
		}, timeout);

		const handler = (data: WebSocket.RawData) => {
			try {
				messages.push(JSON.parse(data.toString()) as JSONRPCResponse);
				if (messages.length >= count) {
					clearTimeout(timer);
					ws.off("message", handler);
					resolve(messages);
				}
			} catch (err) {
				clearTimeout(timer);
				ws.off("message", handler);
				reject(err);
			}
		};

		ws.on("message", handler);
	});
}

/**
 * Wait for WebSocket to close.
 */
export function waitForClose(ws: WebSocket, timeout: number = 5000): Promise<number> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error("Timeout waiting for close"));
		}, timeout);

		ws.once("close", (code: number) => {
			clearTimeout(timer);
			resolve(code);
		});
	});
}

/**
 * Close client gracefully.
 */
export function closeClient(ws: WebSocket): Promise<void> {
	return new Promise((resolve) => {
		if (ws.readyState === WebSocket.CLOSED) {
			resolve();
			return;
		}
		ws.once("close", () => resolve());
		ws.close();
	});
}

/**
 * Perform MCP initialize handshake.
 */
export async function performHandshake(
	ws: WebSocket
): Promise<JSONRPCResponse> {
	return sendJsonRpc(ws, "initialize", 1, {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "test-client", version: "1.0.0" },
	});
}
