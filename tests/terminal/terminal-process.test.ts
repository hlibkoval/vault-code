import {describe, it, expect, vi, beforeEach} from "vitest";
import type {ChildProcess} from "child_process";
import {
	TerminalProcess,
	TerminalProcessDeps,
} from "../../src/terminal/terminal-process";

/**
 * Create a mock ChildProcess with controllable streams and events.
 */
function createMockProcess(): ChildProcess & {
	_emit: (event: string, ...args: unknown[]) => void;
} {
	const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

	const mockProcess = {
		stdin: {write: vi.fn()},
		stdout: {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				if (!eventHandlers[`stdout:${event}`]) {
					eventHandlers[`stdout:${event}`] = [];
				}
				eventHandlers[`stdout:${event}`].push(handler);
			}),
		},
		stderr: {
			on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
				if (!eventHandlers[`stderr:${event}`]) {
					eventHandlers[`stderr:${event}`] = [];
				}
				eventHandlers[`stderr:${event}`].push(handler);
			}),
		},
		on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
			if (!eventHandlers[event]) {
				eventHandlers[event] = [];
			}
			eventHandlers[event].push(handler);
		}),
		killed: false,
		kill: vi.fn(),
		_emit: (event: string, ...args: unknown[]) => {
			const handlers = eventHandlers[event] || [];
			handlers.forEach((h) => h(...args));
		},
	};

	return mockProcess as unknown as ChildProcess & {
		_emit: (event: string, ...args: unknown[]) => void;
	};
}

/**
 * Create mock dependencies for testing.
 */
function createMockDeps(
	overrides: Partial<TerminalProcessDeps> = {}
): TerminalProcessDeps {
	return {
		platform: "darwin",
		spawn: vi.fn().mockReturnValue(createMockProcess()),
		execSync: vi.fn().mockReturnValue("__PATH__\n/usr/local/bin:/usr/bin\n"),
		writeFileSync: vi.fn(),
		tmpdir: vi.fn().mockReturnValue("/tmp"),
		env: {SHELL: "/bin/zsh", PATH: "/usr/bin"},
		...overrides,
	};
}

describe("TerminalProcess", () => {
	describe("buildClaudeCommand", () => {
		it("should return plain claude when no options enabled", () => {
			const proc = new TerminalProcess(createMockDeps());
			const result = proc.buildClaudeCommand({
				useIdeFlag: false,
				continueSession: false,
			});
			expect(result).toBe("claude");
		});

		it("should add --ide flag when useIdeFlag is true", () => {
			const proc = new TerminalProcess(createMockDeps());
			const result = proc.buildClaudeCommand({
				useIdeFlag: true,
				continueSession: false,
			});
			expect(result).toBe("claude --ide");
		});

		it("should add --continue flag when continueSession is true", () => {
			const proc = new TerminalProcess(createMockDeps());
			const result = proc.buildClaudeCommand({
				useIdeFlag: false,
				continueSession: true,
			});
			expect(result).toBe("claude --continue");
		});

		it("should add both flags when both options are true", () => {
			const proc = new TerminalProcess(createMockDeps());
			const result = proc.buildClaudeCommand({
				useIdeFlag: true,
				continueSession: true,
			});
			expect(result).toBe("claude --ide --continue");
		});
	});

	describe("constructor", () => {
		it("should detect Windows platform", () => {
			const proc = new TerminalProcess(createMockDeps({platform: "win32"}));
			expect(proc.platform).toBe("win32");
		});

		it("should detect macOS platform", () => {
			const proc = new TerminalProcess(createMockDeps({platform: "darwin"}));
			expect(proc.platform).toBe("darwin");
		});

		it("should detect Linux platform", () => {
			const proc = new TerminalProcess(createMockDeps({platform: "linux"}));
			expect(proc.platform).toBe("linux");
		});
	});

	describe("start", () => {
		let mockDeps: TerminalProcessDeps;
		let mockProcess: ReturnType<typeof createMockProcess>;

		beforeEach(() => {
			mockProcess = createMockProcess();
			mockDeps = createMockDeps({
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
		});

		it("should write PTY script to temp directory", () => {
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(mockDeps.writeFileSync).toHaveBeenCalledWith(
				"/tmp/claude_sidebar_pty.py",
				expect.any(String),
				{mode: 0o755}
			);
		});

		it("should use Windows PTY script on Windows", () => {
			const winDeps = createMockDeps({
				platform: "win32",
				spawn: vi.fn().mockReturnValue(mockProcess),
				env: {COMSPEC: "cmd.exe"},
			});
			const proc = new TerminalProcess(winDeps);
			proc.start({
				cwd: "C:\\test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(winDeps.writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining("claude_sidebar_win.py"),
				expect.any(String),
				{mode: 0o755}
			);
		});

		it("should spawn python3 on Unix", () => {
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(mockDeps.spawn).toHaveBeenCalledWith(
				"python3",
				expect.any(Array),
				expect.any(Object)
			);
		});

		it("should spawn python on Windows", () => {
			const winDeps = createMockDeps({
				platform: "win32",
				spawn: vi.fn().mockReturnValue(mockProcess),
				env: {COMSPEC: "cmd.exe"},
			});
			const proc = new TerminalProcess(winDeps);
			proc.start({
				cwd: "C:\\test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(winDeps.spawn).toHaveBeenCalledWith(
				"python",
				expect.any(Array),
				expect.any(Object)
			);
		});

		it("should include claude command with --ide flag in Unix args", () => {
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: true, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			const spawnArgs = (mockDeps.spawn as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as string[];
			const shellCommand = spawnArgs[spawnArgs.length - 1];
			expect(shellCommand).toContain("claude --ide");
		});

		it("should include claude command with --continue flag in Unix args", () => {
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: true},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			const spawnArgs = (mockDeps.spawn as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as string[];
			const shellCommand = spawnArgs[spawnArgs.length - 1];
			expect(shellCommand).toContain("claude --continue");
		});

		it("should include both flags in Unix args when both enabled", () => {
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: true, continueSession: true},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			const spawnArgs = (mockDeps.spawn as ReturnType<typeof vi.fn>).mock
				.calls[0][1] as string[];
			const shellCommand = spawnArgs[spawnArgs.length - 1];
			expect(shellCommand).toContain("claude --ide --continue");
		});

		it("should extract PATH from shell on Unix", () => {
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(mockDeps.execSync).toHaveBeenCalledWith(
				expect.stringContaining("echo \"__PATH__\""),
				{encoding: "utf8", timeout: 2000}
			);
		});

		it("should not extract PATH on Windows", () => {
			const winDeps = createMockDeps({
				platform: "win32",
				spawn: vi.fn().mockReturnValue(mockProcess),
				env: {COMSPEC: "cmd.exe"},
			});
			const proc = new TerminalProcess(winDeps);
			proc.start({
				cwd: "C:\\test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(winDeps.execSync).not.toHaveBeenCalled();
		});

		it("should call onData when process outputs data", () => {
			const onData = vi.fn();
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData,
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			// Simulate stdout data
			mockProcess._emit("stdout:data", Buffer.from("hello"));
			expect(onData).toHaveBeenCalledWith("hello");
		});

		it("should call onExit when process exits", () => {
			const onExit = vi.fn();
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit,
				onError: vi.fn(),
			});

			mockProcess._emit("exit", 0, null);
			expect(onExit).toHaveBeenCalledWith(0, null);
		});

		it("should call onError when process errors", () => {
			const onError = vi.fn();
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError,
			});

			const error = new Error("spawn failed");
			mockProcess._emit("error", error);
			expect(onError).toHaveBeenCalledWith(error);
		});

		it("should use SHELL from environment on Unix", () => {
			const customDeps = createMockDeps({
				env: {SHELL: "/bin/fish", PATH: "/usr/bin"},
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(customDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(customDeps.execSync).toHaveBeenCalledWith(
				expect.stringContaining("/bin/fish"),
				expect.any(Object)
			);
		});

		it("should default to /bin/bash if SHELL not set", () => {
			const customDeps = createMockDeps({
				env: {PATH: "/usr/bin"},
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(customDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(customDeps.execSync).toHaveBeenCalledWith(
				expect.stringContaining("/bin/bash"),
				expect.any(Object)
			);
		});
	});

	describe("write", () => {
		it("should write data to process stdin", () => {
			const mockProcess = createMockProcess();
			const mockDeps = createMockDeps({
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			proc.write("test input");
			expect(mockProcess.stdin?.write).toHaveBeenCalledWith("test input");
		});

		it("should not write if process not running", () => {
			const proc = new TerminalProcess(createMockDeps());
			// Don't start - process is null
			proc.write("test input");
			// Should not throw, just do nothing
		});
	});

	describe("resize", () => {
		it("should send resize escape sequence", () => {
			const mockProcess = createMockProcess();
			const mockDeps = createMockDeps({
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			proc.resize(120, 40);
			expect(mockProcess.stdin?.write).toHaveBeenCalledWith(
				"\x1b]RESIZE;120;40\x07"
			);
		});
	});

	describe("stop", () => {
		it("should kill the process", () => {
			const mockProcess = createMockProcess();
			const mockDeps = createMockDeps({
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			proc.stop();
			expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
		});

		it("should be safe to call when not running", () => {
			const proc = new TerminalProcess(createMockDeps());
			expect(() => proc.stop()).not.toThrow();
		});
	});

	describe("isRunning", () => {
		it("should return false when not started", () => {
			const proc = new TerminalProcess(createMockDeps());
			expect(proc.isRunning).toBe(false);
		});

		it("should return true when running", () => {
			const mockProcess = createMockProcess();
			const mockDeps = createMockDeps({
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			expect(proc.isRunning).toBe(true);
		});

		it("should return false after process exits", () => {
			const mockProcess = createMockProcess();
			const mockDeps = createMockDeps({
				spawn: vi.fn().mockReturnValue(mockProcess),
			});
			const proc = new TerminalProcess(mockDeps);
			proc.start({
				cwd: "/test",
				cols: 80,
				rows: 24,
				claudeOptions: {useIdeFlag: false, continueSession: false},
				onData: vi.fn(),
				onExit: vi.fn(),
				onError: vi.fn(),
			});

			// Simulate exit
			mockProcess._emit("exit", 0, null);
			expect(proc.isRunning).toBe(false);
		});
	});
});
