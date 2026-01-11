/**
 * Lock file management for MCP IDE integration.
 * Creates and manages the lock file that Claude Code uses to discover IDE integrations.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as net from "net";
import type { LockFileContent } from "./mcp-types";

/**
 * Find an available port by creating a temporary server.
 */
export function findAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				const port = address.port;
				server.close(() => resolve(port));
			} else {
				server.close(() => reject(new Error("Failed to get port")));
			}
		});
		server.on("error", reject);
	});
}

/**
 * Generate a secure auth token (64 bytes, base64url encoded).
 */
export function generateAuthToken(): string {
	const bytes = crypto.randomBytes(64);
	return bytes.toString("base64url");
}

/**
 * Get the lock file directory path.
 * Uses CLAUDE_CONFIG_DIR env var if set, otherwise ~/.claude/ide/
 */
function getLockFileDir(): string {
	const configDir = process.env.CLAUDE_CONFIG_DIR;
	if (configDir) {
		return path.join(configDir, "ide");
	}
	return path.join(os.homedir(), ".claude", "ide");
}

/**
 * Ensure the lock file directory exists.
 */
function ensureLockFileDir(): string {
	const dir = getLockFileDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
}

/**
 * Create a lock file for Claude Code to discover this IDE integration.
 */
export function createLockFile(
	port: number,
	vaultPath: string,
	authToken: string
): LockFileContent {
	const dir = ensureLockFileDir();
	const lockFilePath = path.join(dir, `${port}.lock`);

	const content: LockFileContent = {
		workspaceFolders: [vaultPath],
		pid: process.pid,
		ideName: "Vault Code",
		transport: "ws",
		runningInWindows: process.platform === "win32",
		authToken,
	};

	fs.writeFileSync(lockFilePath, JSON.stringify(content), "utf-8");
	return content;
}

/**
 * Delete the lock file for a given port.
 */
export function deleteLockFile(port: number): void {
	const dir = getLockFileDir();
	const lockFilePath = path.join(dir, `${port}.lock`);

	try {
		if (fs.existsSync(lockFilePath)) {
			fs.unlinkSync(lockFilePath);
		}
	} catch {
		// Ignore errors during cleanup
	}
}

/**
 * Clean up lock files for a given vault path.
 * Called on startup to remove any existing locks for this vault
 * (handles hot reload where PID stays the same).
 */
export function cleanupStaleLockFiles(vaultPath: string): void {
	const dir = getLockFileDir();
	if (!fs.existsSync(dir)) {
		return;
	}

	try {
		const files = fs.readdirSync(dir);
		for (const file of files) {
			if (!file.endsWith(".lock")) continue;

			const lockFilePath = path.join(dir, file);
			try {
				const content = fs.readFileSync(lockFilePath, "utf-8");
				const lockInfo = JSON.parse(content) as LockFileContent;

				// Remove all lock files for this vault (we're about to create a new one)
				if (lockInfo.workspaceFolders?.includes(vaultPath)) {
					console.debug(`MCP: Removing old lock file: ${file}`);
					fs.unlinkSync(lockFilePath);
				}
			} catch {
				// Ignore individual file errors
			}
		}
	} catch {
		// Ignore errors during cleanup
	}
}
