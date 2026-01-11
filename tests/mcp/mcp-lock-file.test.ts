import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import * as fs from "fs";
import * as os from "os";
import {
	generateAuthToken,
	findAvailablePort,
	createLockFile,
	deleteLockFile,
	cleanupStaleLockFiles,
} from "../../src/mcp/mcp-lock-file";

// Mock fs and os modules
vi.mock("fs");
vi.mock("os");

describe("mcp-lock-file", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock for os.homedir
		vi.mocked(os.homedir).mockReturnValue("/Users/test");
	});

	afterEach(() => {
		// Clean up env vars
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	describe("generateAuthToken", () => {
		it("should generate a base64url encoded token", () => {
			const token = generateAuthToken();

			// Should be base64url (no +, /, or = characters)
			expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
		});

		it("should generate token of expected length", () => {
			const token = generateAuthToken();

			// 64 bytes -> ~86 characters in base64url (no padding)
			expect(token.length).toBeGreaterThan(80);
			expect(token.length).toBeLessThan(90);
		});

		it("should generate unique tokens on each call", () => {
			const token1 = generateAuthToken();
			const token2 = generateAuthToken();

			expect(token1).not.toBe(token2);
		});
	});

	describe("findAvailablePort", () => {
		it("should return a valid port number", async () => {
			const port = await findAvailablePort();

			expect(typeof port).toBe("number");
			expect(port).toBeGreaterThan(0);
			expect(port).toBeLessThan(65536);
		});

		it("should return an ephemeral port (>1023)", async () => {
			const port = await findAvailablePort();

			// Ephemeral ports are typically > 1023
			expect(port).toBeGreaterThan(1023);
		});
	});

	describe("createLockFile", () => {
		it("should write lock file with correct content", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.writeFileSync).mockImplementation(() => {});

			const result = createLockFile(
				12345,
				"/Users/test/vault",
				"test-token"
			);

			expect(result).toEqual({
				workspaceFolders: ["/Users/test/vault"],
				pid: process.pid,
				ideName: "Vault Code",
				transport: "ws",
				runningInWindows: process.platform === "win32",
				authToken: "test-token",
			});

			expect(fs.writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("12345.lock"),
				expect.any(String),
				"utf-8"
			);
		});

		it("should write valid JSON to lock file", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			let writtenContent = "";
			vi.mocked(fs.writeFileSync).mockImplementation(
				(_path, content) => {
					writtenContent = content as string;
				}
			);

			createLockFile(12345, "/vault", "token");

			const parsed = JSON.parse(writtenContent);
			expect(parsed.workspaceFolders).toEqual(["/vault"]);
			expect(parsed.authToken).toBe("token");
		});

		it("should create lock file directory if it does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
			vi.mocked(fs.writeFileSync).mockImplementation(() => {});

			createLockFile(12345, "/Users/test/vault", "test-token");

			expect(fs.mkdirSync).toHaveBeenCalledWith(
				expect.stringContaining(".claude"),
				{recursive: true}
			);
		});

		it("should use CLAUDE_CONFIG_DIR env var when set", () => {
			process.env.CLAUDE_CONFIG_DIR = "/custom/config";
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.writeFileSync).mockImplementation(() => {});

			createLockFile(12345, "/Users/test/vault", "test-token");

			expect(fs.writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("/custom/config/ide/12345.lock"),
				expect.any(String),
				"utf-8"
			);
		});

		it("should use default path when CLAUDE_CONFIG_DIR is not set", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.writeFileSync).mockImplementation(() => {});

			createLockFile(12345, "/vault", "token");

			expect(fs.writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("/Users/test/.claude/ide/12345.lock"),
				expect.any(String),
				"utf-8"
			);
		});
	});

	describe("deleteLockFile", () => {
		it("should delete lock file if it exists", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			deleteLockFile(12345);

			expect(fs.unlinkSync).toHaveBeenCalledWith(
				expect.stringContaining("12345.lock")
			);
		});

		it("should not throw if lock file does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			expect(() => deleteLockFile(12345)).not.toThrow();
			expect(fs.unlinkSync).not.toHaveBeenCalled();
		});

		it("should ignore errors during deletion", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.unlinkSync).mockImplementation(() => {
				throw new Error("Permission denied");
			});

			expect(() => deleteLockFile(12345)).not.toThrow();
		});
	});

	describe("cleanupStaleLockFiles", () => {
		it("should remove lock files matching the vault path", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([
				"12345.lock",
				"67890.lock",
			] as unknown as fs.Dirent[]);
			vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
				if (String(filePath).includes("12345")) {
					return JSON.stringify({
						workspaceFolders: ["/Users/test/vault"],
					});
				}
				return JSON.stringify({workspaceFolders: ["/other/vault"]});
			});
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			cleanupStaleLockFiles("/Users/test/vault");

			expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
			expect(fs.unlinkSync).toHaveBeenCalledWith(
				expect.stringContaining("12345.lock")
			);
		});

		it("should not remove lock files for other vaults", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([
				"12345.lock",
			] as unknown as fs.Dirent[]);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({workspaceFolders: ["/different/vault"]})
			);
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			cleanupStaleLockFiles("/Users/test/vault");

			expect(fs.unlinkSync).not.toHaveBeenCalled();
		});

		it("should skip non-.lock files", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([
				"readme.txt",
				"12345.lock",
			] as unknown as fs.Dirent[]);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({workspaceFolders: ["/vault"]})
			);
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			cleanupStaleLockFiles("/vault");

			// Should only read the .lock file
			expect(fs.readFileSync).toHaveBeenCalledTimes(1);
		});

		it("should not throw if directory does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			expect(() => cleanupStaleLockFiles("/Users/test/vault")).not.toThrow();
			expect(fs.readdirSync).not.toHaveBeenCalled();
		});

		it("should handle invalid JSON in lock files", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([
				"bad.lock",
			] as unknown as fs.Dirent[]);
			vi.mocked(fs.readFileSync).mockReturnValue("not valid json");

			expect(() => cleanupStaleLockFiles("/vault")).not.toThrow();
		});

		it("should handle lock files without workspaceFolders", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readdirSync).mockReturnValue([
				"12345.lock",
			] as unknown as fs.Dirent[]);
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));
			vi.mocked(fs.unlinkSync).mockImplementation(() => {});

			expect(() => cleanupStaleLockFiles("/vault")).not.toThrow();
			expect(fs.unlinkSync).not.toHaveBeenCalled();
		});
	});
});
