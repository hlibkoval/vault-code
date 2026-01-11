import {describe, it, expect, vi, beforeEach} from "vitest";
import type {JSONRPCNotification} from "../../src/mcp/mcp-types";

// Mock MCPServer - use vi.hoisted to avoid hoisting issues
const {
	mockStart,
	mockStop,
	mockSendNotification,
	mockHasConnectedClients,
	MockMCPServer,
} = vi.hoisted(() => {
	const mockStart = vi.fn().mockResolvedValue(undefined);
	const mockStop = vi.fn();
	const mockSendNotification = vi.fn();
	const mockHasConnectedClients = vi.fn().mockReturnValue(false);

	const MockMCPServer = vi.fn().mockImplementation(() => ({
		start: mockStart,
		stop: mockStop,
		sendNotification: mockSendNotification,
		hasConnectedClients: mockHasConnectedClients,
	}));

	return {
		mockStart,
		mockStop,
		mockSendNotification,
		mockHasConnectedClients,
		MockMCPServer,
	};
});

vi.mock("../../src/mcp/mcp-server", () => ({
	MCPServer: MockMCPServer,
}));

// Mock cleanupStaleLockFiles
const {mockCleanupStaleLockFiles} = vi.hoisted(() => {
	return {mockCleanupStaleLockFiles: vi.fn()};
});

vi.mock("../../src/mcp/mcp-lock-file", () => ({
	cleanupStaleLockFiles: mockCleanupStaleLockFiles,
}));

// Import after mocks
import {MCPIntegration} from "../../src/mcp/mcp-integration";
import {MCPServer} from "../../src/mcp/mcp-server";

describe("MCPIntegration", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("start", () => {
		it("should cleanup stale lock files before starting", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			await integration.start();

			expect(mockCleanupStaleLockFiles).toHaveBeenCalledWith("/test/vault");
		});

		it("should create MCPServer with correct options", async () => {
			const onInitialized = vi.fn();
			const onConnected = vi.fn();
			const onDisconnected = vi.fn();

			const integration = new MCPIntegration({
				vaultPath: "/test/vault",
				onInitialized,
				onConnected,
				onDisconnected,
			});

			await integration.start();

			expect(MCPServer).toHaveBeenCalledWith({
				vaultPath: "/test/vault",
				onInitialized,
				onConnected,
				onDisconnected,
			});
		});

		it("should call mcpServer.start", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			await integration.start();

			expect(mockStart).toHaveBeenCalled();
		});

		it("should return early if vaultPath is empty", async () => {
			const integration = new MCPIntegration({vaultPath: ""});

			await integration.start();

			expect(mockCleanupStaleLockFiles).not.toHaveBeenCalled();
			expect(MCPServer).not.toHaveBeenCalled();
		});

		it("should catch and log errors from MCPServer.start", async () => {
			const error = new Error("Start failed");
			mockStart.mockRejectedValueOnce(error);
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			await integration.start();

			expect(consoleSpy).toHaveBeenCalledWith(
				"MCP: Failed to start server:",
				error
			);

			consoleSpy.mockRestore();
		});

		it("should not throw when start fails", async () => {
			mockStart.mockRejectedValueOnce(new Error("Start failed"));
			vi.spyOn(console, "error").mockImplementation(() => {});

			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			await expect(integration.start()).resolves.toBeUndefined();
		});
	});

	describe("stop", () => {
		it("should call mcpServer.stop", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();

			integration.stop();

			expect(mockStop).toHaveBeenCalled();
		});

		it("should set mcpServer to null after stop", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();

			integration.stop();

			// Verify server is nulled by checking that subsequent calls don't delegate
			mockHasConnectedClients.mockReturnValue(true);
			expect(integration.hasConnectedClients()).toBe(false);
		});

		it("should be safe to call when mcpServer is null", () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			// Never started, so mcpServer is null
			expect(() => integration.stop()).not.toThrow();
		});

		it("should be safe to call multiple times", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();

			integration.stop();
			expect(() => integration.stop()).not.toThrow();

			// stop() should only have been called once (first stop call)
			expect(mockStop).toHaveBeenCalledTimes(1);
		});
	});

	describe("sendNotification", () => {
		it("should delegate to mcpServer.sendNotification", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();

			const notification: JSONRPCNotification = {
				jsonrpc: "2.0",
				method: "selection_changed",
				params: {selection: null, text: null, filePath: null},
			};

			integration.sendNotification(notification);

			expect(mockSendNotification).toHaveBeenCalledWith(notification);
		});

		it("should be safe to call when mcpServer is null", () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			const notification: JSONRPCNotification = {
				jsonrpc: "2.0",
				method: "selection_changed",
				params: {selection: null, text: null, filePath: null},
			};

			expect(() => integration.sendNotification(notification)).not.toThrow();
			expect(mockSendNotification).not.toHaveBeenCalled();
		});

		it("should not send after stop", async () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();
			integration.stop();

			mockSendNotification.mockClear();

			const notification: JSONRPCNotification = {
				jsonrpc: "2.0",
				method: "selection_changed",
				params: {selection: null, text: null, filePath: null},
			};

			integration.sendNotification(notification);

			expect(mockSendNotification).not.toHaveBeenCalled();
		});
	});

	describe("hasConnectedClients", () => {
		it("should delegate to mcpServer.hasConnectedClients", async () => {
			mockHasConnectedClients.mockReturnValue(true);
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();

			const result = integration.hasConnectedClients();

			expect(result).toBe(true);
			expect(mockHasConnectedClients).toHaveBeenCalled();
		});

		it("should return false when mcpServer returns false", async () => {
			mockHasConnectedClients.mockReturnValue(false);
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();

			const result = integration.hasConnectedClients();

			expect(result).toBe(false);
		});

		it("should return false when mcpServer is null", () => {
			const integration = new MCPIntegration({vaultPath: "/test/vault"});

			const result = integration.hasConnectedClients();

			expect(result).toBe(false);
			expect(mockHasConnectedClients).not.toHaveBeenCalled();
		});

		it("should return false after stop", async () => {
			mockHasConnectedClients.mockReturnValue(true);
			const integration = new MCPIntegration({vaultPath: "/test/vault"});
			await integration.start();
			integration.stop();

			mockHasConnectedClients.mockClear();

			const result = integration.hasConnectedClients();

			expect(result).toBe(false);
			expect(mockHasConnectedClients).not.toHaveBeenCalled();
		});
	});
});
