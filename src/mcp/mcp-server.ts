/**
 * MCP WebSocket server for IDE integration with Claude Code.
 * Uses Node's built-in http module to implement WebSocket protocol.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { createHash } from "crypto";
import type { Socket } from "net";
import type { JSONRPCNotification, IdeConnectedParams } from "./mcp-types";
import {
	findAvailablePort,
	generateAuthToken,
	createLockFile,
	deleteLockFile,
} from "./mcp-lock-file";

// WebSocket frame opcodes
const WS_OPCODE_TEXT = 0x01;
const WS_OPCODE_CLOSE = 0x08;
const WS_OPCODE_PING = 0x09;
const WS_OPCODE_PONG = 0x0a;

// WebSocket GUID for handshake
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

interface WSClient {
	socket: Socket;
	authenticated: boolean;
	pendingPing: { id: number; timeout: ReturnType<typeof setTimeout> } | null;
}

export interface MCPServerOptions {
	vaultPath: string;
	onInitialized?: () => void;
	onConnected?: (clientPid: number) => void;
	onDisconnected?: () => void;
}

// Keepalive settings
const PING_INTERVAL_MS = 5000; // Send ping every 5 seconds
const PING_TIMEOUT_MS = 3000; // Consider dead if no pong within 3 seconds

export class MCPServer {
	private server: Server | null = null;
	private port: number = 0;
	private authToken: string = "";
	private connectedClients: Set<WSClient> = new Set();
	private options: MCPServerOptions;
	private pingIntervalId: ReturnType<typeof setInterval> | null = null;
	private nextPingId: number = 10000; // Start high to avoid collision with client IDs

	constructor(options: MCPServerOptions) {
		this.options = options;
	}

	/**
	 * Start the MCP server.
	 */
	async start(): Promise<void> {
		this.port = await findAvailablePort();
		this.authToken = generateAuthToken();

		// Create lock file for Claude Code discovery
		createLockFile(this.port, this.options.vaultPath, this.authToken);
		console.debug(`MCP: Server starting on port ${this.port}`);

		// Create HTTP server for WebSocket upgrade
		this.server = createServer((_req: IncomingMessage, res: ServerResponse) => {
			// Regular HTTP requests get 404
			res.writeHead(404);
			res.end();
		});

		this.server.on("upgrade", (req, socket, head) => {
			this.handleUpgrade(req, socket as Socket, head);
		});

		this.server.on("error", (err: Error) => {
			console.error("MCP server error:", err);
		});

		await new Promise<void>((resolve) => {
			this.server!.listen(this.port, "127.0.0.1", () => {
				resolve();
			});
		});
	}

	/**
	 * Stop the MCP server.
	 */
	stop(): void {
		// Stop keepalive first
		this.stopKeepalive();

		// Close all client connections
		for (const client of this.connectedClients) {
			try {
				if (client.pendingPing) {
					clearTimeout(client.pendingPing.timeout);
					client.pendingPing = null;
				}
				this.sendCloseFrame(client.socket, 1000, "Server shutting down");
				client.socket.destroy();
			} catch {
				// Ignore errors
			}
		}
		this.connectedClients.clear();

		// Close server
		if (this.server) {
			this.server.close();
			this.server = null;
		}

		// Delete lock file
		if (this.port > 0) {
			deleteLockFile(this.port);
			this.port = 0;
		}
	}

	/**
	 * Handle WebSocket upgrade request.
	 */
	private handleUpgrade(req: IncomingMessage, socket: Socket, _head: Buffer): void {
		const path = req.url || "";

		// Accept connections to / or /mcp path
		if (path !== "/" && path !== "/mcp") {
			socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
			socket.destroy();
			return;
		}

		// Verify MCP subprotocol
		const protocol = req.headers["sec-websocket-protocol"];
		if (protocol !== "mcp") {
			socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
			socket.destroy();
			return;
		}

		// Verify auth token
		const providedToken = req.headers["x-claude-code-ide-authorization"];
		if (providedToken !== this.authToken) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
			socket.destroy();
			return;
		}

		// Perform WebSocket handshake
		const key = req.headers["sec-websocket-key"];
		if (!key) {
			socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
			socket.destroy();
			return;
		}

		const acceptKey = createHash("sha1")
			.update(key + WS_GUID)
			.digest("base64");

		const response =
			"HTTP/1.1 101 Switching Protocols\r\n" +
			"Upgrade: websocket\r\n" +
			"Connection: Upgrade\r\n" +
			`Sec-WebSocket-Accept: ${acceptKey}\r\n` +
			"Sec-WebSocket-Protocol: mcp\r\n" +
			"\r\n";

		socket.write(response);

		const client: WSClient = { socket, authenticated: true, pendingPing: null };
		this.connectedClients.add(client);
		console.debug("MCP: Client connected");

		// Start keepalive pings
		this.startKeepalive();

		socket.on("data", (data) => this.handleData(client, data));

		socket.on("close", () => {
			if (client.pendingPing) {
				clearTimeout(client.pendingPing.timeout);
				client.pendingPing = null;
			}
			this.connectedClients.delete(client);
			if (this.connectedClients.size === 0) {
				this.stopKeepalive();
			}
			console.debug("MCP: Client disconnected");
			this.options.onDisconnected?.();
		});

		socket.on("error", (err) => {
			console.error("MCP: Client socket error:", err);
			if (client.pendingPing) {
				clearTimeout(client.pendingPing.timeout);
				client.pendingPing = null;
			}
			this.connectedClients.delete(client);
			if (this.connectedClients.size === 0) {
				this.stopKeepalive();
			}
		});

		socket.on("end", () => {
			// Socket ended
		});
	}

	/**
	 * Handle incoming WebSocket data.
	 */
	private handleData(client: WSClient, data: Buffer): void {
		try {
			const frames = this.parseFrames(data);
			for (const frame of frames) {
				if (frame.opcode === WS_OPCODE_TEXT) {
					this.handleMessage(client, frame.payload.toString("utf-8"));
				} else if (frame.opcode === WS_OPCODE_PING) {
					this.sendFrame(client.socket, WS_OPCODE_PONG, frame.payload);
				} else if (frame.opcode === WS_OPCODE_CLOSE) {
					this.connectedClients.delete(client);
					client.socket.destroy();
				}
			}
		} catch (err) {
			console.error("MCP: Error handling data:", err);
		}
	}

	/**
	 * Parse WebSocket frames from buffer.
	 */
	private parseFrames(data: Buffer): Array<{ opcode: number; payload: Buffer }> {
		const frames: Array<{ opcode: number; payload: Buffer }> = [];
		let offset = 0;

		while (offset < data.length) {
			if (offset + 2 > data.length) break;

			const firstByte = data[offset]!;
			const secondByte = data[offset + 1]!;
			const opcode = firstByte & 0x0f;
			const masked = (secondByte & 0x80) !== 0;
			let payloadLen = secondByte & 0x7f;
			offset += 2;

			// Extended payload length
			if (payloadLen === 126) {
				if (offset + 2 > data.length) break;
				payloadLen = data.readUInt16BE(offset);
				offset += 2;
			} else if (payloadLen === 127) {
				if (offset + 8 > data.length) break;
				payloadLen = Number(data.readBigUInt64BE(offset));
				offset += 8;
			}

			// Masking key
			let maskKey: Buffer | null = null;
			if (masked) {
				if (offset + 4 > data.length) break;
				maskKey = data.subarray(offset, offset + 4);
				offset += 4;
			}

			// Payload
			if (offset + payloadLen > data.length) break;
			let payload = data.subarray(offset, offset + payloadLen);
			offset += payloadLen;

			// Unmask if needed
			if (maskKey) {
				const unmasked = Buffer.from(payload);
				for (let i = 0; i < unmasked.length; i++) {
					unmasked[i] = unmasked[i]! ^ maskKey[i % 4]!;
				}
				payload = unmasked;
			}

			frames.push({ opcode, payload });
		}

		return frames;
	}

	/**
	 * Handle a parsed message.
	 */
	private handleMessage(client: WSClient, data: string): void {
		try {
			const message = JSON.parse(data) as {
				jsonrpc?: string;
				method?: string;
				id?: number;
				result?: object;
				params?: IdeConnectedParams | {
					protocolVersion?: string;
					capabilities?: object;
					clientInfo?: { name: string; version: string };
				};
			};

			// Handle ping response (for our keepalive pings)
			if (message.id !== undefined && message.result !== undefined && !message.method) {
				// This is a response, check if it's for our pending ping
				if (client.pendingPing && client.pendingPing.id === message.id) {
					clearTimeout(client.pendingPing.timeout);
					client.pendingPing = null;
				}
				return;
			}

			// Handle ping request (from client)
			if (message.method === "ping" && message.id !== undefined) {
				const response = {
					jsonrpc: "2.0",
					id: message.id,
					result: {},
				};
				const responseData = Buffer.from(JSON.stringify(response), "utf-8");
				this.sendFrame(client.socket, WS_OPCODE_TEXT, responseData);
				return;
			}

			// Handle initialize request (MCP handshake)
			if (message.method === "initialize" && message.id !== undefined) {
				const response = {
					jsonrpc: "2.0",
					id: message.id,
					result: {
						protocolVersion: "2024-11-05",
						capabilities: {
							tools: {
								listChanged: true,
							},
						},
						serverInfo: {
							name: "Vault Code",
							version: "0.0.4",
						},
					},
				};
				const responseData = Buffer.from(JSON.stringify(response), "utf-8");
				for (const client of this.connectedClients) {
					if (!client.socket.destroyed) {
						this.sendFrame(client.socket, WS_OPCODE_TEXT, responseData);
					}
				}
				return;
			}

			// Handle initialized notification (MCP handshake complete)
			if (message.method === "notifications/initialized" || message.method === "initialized") {
				// Note: onInitialized is called after tools/list (end of discovery phase)
				return;
			}

			// Handle tools/list request (typically last discovery request from Claude Code)
			if (message.method === "tools/list" && message.id !== undefined) {
				const response = {
					jsonrpc: "2.0",
					id: message.id,
					result: {
						tools: [],
					},
				};
				const responseData = Buffer.from(JSON.stringify(response), "utf-8");
				for (const client of this.connectedClients) {
					if (!client.socket.destroyed) {
						this.sendFrame(client.socket, WS_OPCODE_TEXT, responseData);
					}
				}
				// Discovery phase complete - trigger initial selection
				this.options.onInitialized?.();
				return;
			}

			// Handle resources/list request
			if (message.method === "resources/list" && message.id !== undefined) {
				const response = {
					jsonrpc: "2.0",
					id: message.id,
					result: {
						resources: [],
					},
				};
				const responseData = Buffer.from(JSON.stringify(response), "utf-8");
				for (const client of this.connectedClients) {
					if (!client.socket.destroyed) {
						this.sendFrame(client.socket, WS_OPCODE_TEXT, responseData);
					}
				}
				return;
			}

			// Handle prompts/list request
			if (message.method === "prompts/list" && message.id !== undefined) {
				const response = {
					jsonrpc: "2.0",
					id: message.id,
					result: {
						prompts: [],
					},
				};
				const responseData = Buffer.from(JSON.stringify(response), "utf-8");
				for (const client of this.connectedClients) {
					if (!client.socket.destroyed) {
						this.sendFrame(client.socket, WS_OPCODE_TEXT, responseData);
					}
				}
				return;
			}

			// Handle ide_connected
			if (message.method === "ide_connected" && message.params) {
				const params = message.params as IdeConnectedParams;
				this.options.onConnected?.(params.pid);
				return;
			}

			// Handle unhandled requests with error response
			if (message.id !== undefined) {
				console.warn("MCP: Unhandled request:", message.method);
				const errorResponse = {
					jsonrpc: "2.0",
					id: message.id,
					error: {
						code: -32601,
						message: `Method not found: ${message.method}`,
					},
				};
				const responseData = Buffer.from(JSON.stringify(errorResponse), "utf-8");
				for (const client of this.connectedClients) {
					if (!client.socket.destroyed) {
						this.sendFrame(client.socket, WS_OPCODE_TEXT, responseData);
					}
				}
			}
		} catch (err) {
			console.error("MCP: Failed to parse message:", err);
		}
	}

	/**
	 * Send a WebSocket frame.
	 */
	private sendFrame(socket: Socket, opcode: number, payload: Buffer): void {
		if (socket.destroyed || !socket.writable || socket.readableEnded) {
			return;
		}

		const payloadLen = payload.length;
		let header: Buffer;

		if (payloadLen < 126) {
			header = Buffer.alloc(2);
			header[0] = 0x80 | opcode; // FIN + opcode
			header[1] = payloadLen;
		} else if (payloadLen < 65536) {
			header = Buffer.alloc(4);
			header[0] = 0x80 | opcode;
			header[1] = 126;
			header.writeUInt16BE(payloadLen, 2);
		} else {
			header = Buffer.alloc(10);
			header[0] = 0x80 | opcode;
			header[1] = 127;
			header.writeBigUInt64BE(BigInt(payloadLen), 2);
		}

		const frame = Buffer.concat([header, payload]);
		socket.write(frame);
	}

	/**
	 * Send a close frame.
	 */
	private sendCloseFrame(socket: Socket, code: number, reason: string): void {
		const reasonBuf = Buffer.from(reason, "utf-8");
		const payload = Buffer.alloc(2 + reasonBuf.length);
		payload.writeUInt16BE(code, 0);
		reasonBuf.copy(payload, 2);
		this.sendFrame(socket, WS_OPCODE_CLOSE, payload);
	}

	/**
	 * Send a notification to all connected clients.
	 */
	sendNotification(notification: JSONRPCNotification): void {
		if (this.connectedClients.size === 0) {
			return;
		}

		const json = JSON.stringify(notification);
		const data = Buffer.from(json, "utf-8");

		for (const client of this.connectedClients) {
			if (!client.socket.destroyed) {
				this.sendFrame(client.socket, WS_OPCODE_TEXT, data);
			}
		}
	}

	/**
	 * Check if any clients are connected.
	 */
	hasConnectedClients(): boolean {
		return this.connectedClients.size > 0;
	}

	/**
	 * Get the server port.
	 */
	getPort(): number {
		return this.port;
	}

	/**
	 * Start sending keepalive pings to all connected clients.
	 */
	private startKeepalive(): void {
		// Don't start if already running
		if (this.pingIntervalId) {
			return;
		}

		this.pingIntervalId = setInterval(() => {
			for (const client of this.connectedClients) {
				if (client.socket.destroyed) {
					continue;
				}

				// If there's already a pending ping that hasn't been answered, connection is dead
				if (client.pendingPing) {
					console.warn("MCP: Client did not respond to ping, closing connection");
					this.connectedClients.delete(client);
					client.socket.destroy();
					this.options.onDisconnected?.();
					continue;
				}

				// Send a new ping
				const pingId = this.nextPingId++;
				const pingRequest = {
					jsonrpc: "2.0",
					id: pingId,
					method: "ping",
				};
				const data = Buffer.from(JSON.stringify(pingRequest), "utf-8");
				this.sendFrame(client.socket, WS_OPCODE_TEXT, data);

				// Set timeout for pong response
				client.pendingPing = {
					id: pingId,
					timeout: setTimeout(() => {
						if (client.pendingPing?.id === pingId) {
							console.warn("MCP: Ping timeout, closing connection");
							client.pendingPing = null;
							this.connectedClients.delete(client);
							client.socket.destroy();
							this.options.onDisconnected?.();
						}
					}, PING_TIMEOUT_MS),
				};
			}

			// Stop keepalive if no clients left
			if (this.connectedClients.size === 0) {
				this.stopKeepalive();
			}
		}, PING_INTERVAL_MS);
	}

	/**
	 * Stop the keepalive ping interval.
	 */
	private stopKeepalive(): void {
		if (this.pingIntervalId) {
			clearInterval(this.pingIntervalId);
			this.pingIntervalId = null;
		}

		// Clear any pending ping timeouts
		for (const client of this.connectedClients) {
			if (client.pendingPing) {
				clearTimeout(client.pendingPing.timeout);
				client.pendingPing = null;
			}
		}
	}
}
