import {
	describe,
	it,
	expect,
	beforeEach,
	afterEach,
	vi,
} from "vitest";
import { MCPServer } from "../../src/mcp/mcp-server";
import {
	createTestClient,
	createClientWithInvalidAuth,
	createClientWithoutProtocol,
	sendJsonRpc,
	sendNotification,
	waitForMessage,
	waitForClose,
	closeClient,
	performHandshake,
} from "./helpers/ws-client";
import * as lockFile from "../../src/mcp/mcp-lock-file";
import type WebSocket from "ws";

// Mock lock file functions to avoid filesystem operations
vi.mock("../../src/mcp/mcp-lock-file", async (importOriginal) => {
	const original = await importOriginal<typeof lockFile>();
	return {
		...original,
		createLockFile: vi.fn(),
		deleteLockFile: vi.fn(),
	};
});

describe("MCPServer", () => {
	let server: MCPServer;
	let authToken: string;
	let port: number;
	let clients: WebSocket[] = [];

	// Track clients for cleanup
	const trackClient = (client: WebSocket) => {
		clients.push(client);
		return client;
	};

	beforeEach(async () => {
		vi.clearAllMocks();

		// Get real auth token and port from a server instance
		server = new MCPServer({
			vaultPath: "/test/vault",
		});

		await server.start();
		port = server.getPort();

		// We need to get the auth token - it's generated internally
		// Extract it from the createLockFile mock call
		const createLockFileMock = vi.mocked(lockFile.createLockFile);
		expect(createLockFileMock).toHaveBeenCalled();
		authToken = createLockFileMock.mock.calls[0]![2];
	});

	afterEach(async () => {
		// Close all tracked clients
		for (const client of clients) {
			try {
				await closeClient(client);
			} catch {
				// Ignore errors during cleanup
			}
		}
		clients = [];

		// Stop server
		server?.stop();
	});

	describe("server lifecycle", () => {
		it("starts on available port", () => {
			expect(port).toBeGreaterThan(0);
			expect(port).toBeLessThan(65536);
		});

		it("creates lock file on start", () => {
			const createLockFileMock = vi.mocked(lockFile.createLockFile);
			expect(createLockFileMock).toHaveBeenCalledWith(
				port,
				"/test/vault",
				expect.any(String)
			);
		});

		it("stops cleanly", () => {
			server.stop();

			const deleteLockFileMock = vi.mocked(lockFile.deleteLockFile);
			expect(deleteLockFileMock).toHaveBeenCalledWith(port);
		});

		it("deletes lock file on stop", () => {
			server.stop();

			const deleteLockFileMock = vi.mocked(lockFile.deleteLockFile);
			expect(deleteLockFileMock).toHaveBeenCalled();
		});

		it("can restart after stop", async () => {
			server.stop();

			const newServer = new MCPServer({
				vaultPath: "/test/vault",
			});

			await newServer.start();
			expect(newServer.getPort()).toBeGreaterThan(0);
			newServer.stop();
		});

		it("reports no connected clients initially", () => {
			expect(server.hasConnectedClients()).toBe(false);
		});
	});

	describe("WebSocket handshake", () => {
		it("accepts connection with valid auth token", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			expect(client.readyState).toBe(1); // OPEN
		});

		it("accepts connection to /mcp path", async () => {
			const client = trackClient(await createTestClient(port, authToken, "/mcp"));
			expect(client.readyState).toBe(1);
		});

		it("accepts connection to / path", async () => {
			const client = trackClient(await createTestClient(port, authToken, "/"));
			expect(client.readyState).toBe(1);
		});

		it("rejects connection with invalid auth token", async () => {
			await expect(createClientWithInvalidAuth(port)).rejects.toThrow();
		});

		it("rejects connection without mcp protocol", async () => {
			await expect(createClientWithoutProtocol(port, authToken)).rejects.toThrow();
		});

		it("rejects connection to invalid path", async () => {
			await expect(createTestClient(port, authToken, "/invalid")).rejects.toThrow();
		});
	});

	describe("MCP protocol - initialize", () => {
		it("responds to initialize with capabilities", async () => {
			const client = trackClient(await createTestClient(port, authToken));

			const response = await performHandshake(client);

			expect(response.jsonrpc).toBe("2.0");
			expect(response.id).toBe(1);
			expect(response.result).toBeDefined();
			expect((response.result as { protocolVersion: string }).protocolVersion).toBe("2024-11-05");
			expect((response.result as { serverInfo: { name: string } }).serverInfo.name).toBe("Vault Code");
		});
	});

	describe("MCP protocol - tools/list", () => {
		it("responds to tools/list with empty array", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const response = await sendJsonRpc(client, "tools/list", 2);

			expect(response.result).toEqual({ tools: [] });
		});

		it("calls onInitialized after tools/list", async () => {
			// Create new server with callback
			server.stop();

			const onInitialized = vi.fn();
			server = new MCPServer({
				vaultPath: "/test/vault",
				onInitialized,
			});
			await server.start();

			// Get new auth token
			const createLockFileMock = vi.mocked(lockFile.createLockFile);
			const newAuthToken = createLockFileMock.mock.calls[createLockFileMock.mock.calls.length - 1]![2];
			port = server.getPort();

			const client = trackClient(await createTestClient(port, newAuthToken));
			await performHandshake(client);

			expect(onInitialized).not.toHaveBeenCalled();

			await sendJsonRpc(client, "tools/list", 2);

			expect(onInitialized).toHaveBeenCalled();
		});
	});

	describe("MCP protocol - resources/list", () => {
		it("responds to resources/list with empty array", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const response = await sendJsonRpc(client, "resources/list", 3);

			expect(response.result).toEqual({ resources: [] });
		});
	});

	describe("MCP protocol - prompts/list", () => {
		it("responds to prompts/list with empty array", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const response = await sendJsonRpc(client, "prompts/list", 4);

			expect(response.result).toEqual({ prompts: [] });
		});
	});

	describe("MCP protocol - ping", () => {
		it("responds to ping with empty result", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const response = await sendJsonRpc(client, "ping", 5);

			expect(response.id).toBe(5);
			expect(response.result).toEqual({});
		});
	});

	describe("MCP protocol - unknown method", () => {
		it("returns error for unknown method", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const response = await sendJsonRpc(client, "unknown/method", 6);

			expect(response.error).toBeDefined();
			expect(response.error?.code).toBe(-32601);
			expect(response.error?.message).toContain("Method not found");
		});
	});

	describe("ide_connected notification", () => {
		it("calls onConnected callback with client PID", async () => {
			server.stop();

			const onConnected = vi.fn();
			server = new MCPServer({
				vaultPath: "/test/vault",
				onConnected,
			});
			await server.start();

			const createLockFileMock = vi.mocked(lockFile.createLockFile);
			const newAuthToken = createLockFileMock.mock.calls[createLockFileMock.mock.calls.length - 1]![2];
			port = server.getPort();

			const client = trackClient(await createTestClient(port, newAuthToken));

			sendNotification(client, "ide_connected", { pid: 12345 });

			// Wait a bit for the message to be processed
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(onConnected).toHaveBeenCalledWith(12345);
		});
	});

	describe("sendNotification", () => {
		it("sends notification to connected client", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const messagePromise = waitForMessage(client);

			server.sendNotification({
				jsonrpc: "2.0",
				method: "selection_changed",
				params: { selection: null, text: "test", filePath: "/test.md" },
			});

			const notification = await messagePromise;

			expect(notification.method).toBe("selection_changed");
			expect(notification.params).toEqual({ selection: null, text: "test", filePath: "/test.md" });
		});

		it("sends to all clients when multiple connected", async () => {
			const client1 = trackClient(await createTestClient(port, authToken));
			const client2 = trackClient(await createTestClient(port, authToken));

			await performHandshake(client1);
			await performHandshake(client2);

			const promise1 = waitForMessage(client1);
			const promise2 = waitForMessage(client2);

			server.sendNotification({
				jsonrpc: "2.0",
				method: "selection_changed",
				params: { selection: null, text: null, filePath: null },
			});

			const [msg1, msg2] = await Promise.all([promise1, promise2]);

			expect(msg1.method).toBe("selection_changed");
			expect(msg2.method).toBe("selection_changed");
		});

		it("does nothing when no clients connected", () => {
			// Should not throw
			server.sendNotification({
				jsonrpc: "2.0",
				method: "selection_changed",
				params: { selection: null, text: null, filePath: null },
			});
		});
	});

	describe("client connection state", () => {
		it("reports connected clients after connection", async () => {
			expect(server.hasConnectedClients()).toBe(false);

			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			expect(server.hasConnectedClients()).toBe(true);
		});
	});

	describe("client disconnect", () => {
		it("calls onDisconnected callback", async () => {
			server.stop();

			const onDisconnected = vi.fn();
			server = new MCPServer({
				vaultPath: "/test/vault",
				onDisconnected,
			});
			await server.start();

			const createLockFileMock = vi.mocked(lockFile.createLockFile);
			const newAuthToken = createLockFileMock.mock.calls[createLockFileMock.mock.calls.length - 1]![2];
			port = server.getPort();

			const client = trackClient(await createTestClient(port, newAuthToken));
			await performHandshake(client);

			expect(onDisconnected).not.toHaveBeenCalled();

			client.close();
			await waitForClose(client);

			// Wait a bit for the disconnect to be processed
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(onDisconnected).toHaveBeenCalled();
		});

		it("removes client from connected set on close", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			expect(server.hasConnectedClients()).toBe(true);

			client.close();
			await waitForClose(client);

			// Wait a bit for cleanup
			await new Promise((resolve) => setTimeout(resolve, 50));

			expect(server.hasConnectedClients()).toBe(false);
		});
	});

	describe("multiple clients", () => {
		it("tracks multiple connected clients", async () => {
			const client1 = trackClient(await createTestClient(port, authToken));
			const client2 = trackClient(await createTestClient(port, authToken));

			await performHandshake(client1);
			await performHandshake(client2);

			expect(server.hasConnectedClients()).toBe(true);
		});

		it("broadcasts to all clients", async () => {
			const client1 = trackClient(await createTestClient(port, authToken));
			const client2 = trackClient(await createTestClient(port, authToken));
			const client3 = trackClient(await createTestClient(port, authToken));

			await performHandshake(client1);
			await performHandshake(client2);
			await performHandshake(client3);

			const promises = [
				waitForMessage(client1),
				waitForMessage(client2),
				waitForMessage(client3),
			];

			server.sendNotification({
				jsonrpc: "2.0",
				method: "selection_changed",
				params: { selection: null, text: null, filePath: null },
			});

			const messages = await Promise.all(promises);

			expect(messages).toHaveLength(3);
			expect(messages.every((m) => m.method === "selection_changed")).toBe(true);
		});

		it("continues when one client disconnects", async () => {
			const client1 = trackClient(await createTestClient(port, authToken));
			const client2 = trackClient(await createTestClient(port, authToken));

			await performHandshake(client1);
			await performHandshake(client2);

			// Disconnect first client
			client1.close();
			await waitForClose(client1);
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Server should still work
			expect(server.hasConnectedClients()).toBe(true);

			// Send notification to remaining client
			const messagePromise = waitForMessage(client2);
			server.sendNotification({
				jsonrpc: "2.0",
				method: "selection_changed",
				params: { selection: null, text: "still working", filePath: null },
			});

			const msg = await messagePromise;
			expect(msg.method).toBe("selection_changed");
		});
	});

	describe("keepalive", () => {
		it("responds to server ping with pong", { timeout: 15000 }, async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			// Server sends JSON-RPC pings every 5 seconds
			// Wait for a ping message from the server
			const ping = await waitForMessage(client, 10000);

			expect(ping.method).toBe("ping");
			expect(ping.id).toBeDefined();

			// Respond with pong (result for the ping request)
			client.send(
				JSON.stringify({
					jsonrpc: "2.0",
					id: ping.id,
					result: {},
				})
			);

			// Connection should remain open
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(client.readyState).toBe(1); // OPEN
		});
	});

	describe("server shutdown", () => {
		it("closes connections on stop", async () => {
			const client = trackClient(await createTestClient(port, authToken));
			await performHandshake(client);

			const closePromise = waitForClose(client);

			server.stop();

			const closeCode = await closePromise;
			expect(closeCode).toBe(1000);
		});

		it("handles stop with multiple clients", async () => {
			const client1 = trackClient(await createTestClient(port, authToken));
			const client2 = trackClient(await createTestClient(port, authToken));

			await performHandshake(client1);
			await performHandshake(client2);

			const closePromise1 = waitForClose(client1);
			const closePromise2 = waitForClose(client2);

			server.stop();

			const [code1, code2] = await Promise.all([closePromise1, closePromise2]);
			expect(code1).toBe(1000);
			expect(code2).toBe(1000);
		});
	});
});
