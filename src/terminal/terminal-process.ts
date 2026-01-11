import { spawn, execSync, ChildProcess, SpawnOptionsWithoutStdio } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { StringDecoder } from "string_decoder";
import type { Terminal } from "@xterm/xterm";
import { PTY_SCRIPT_B64, WIN_PTY_SCRIPT_B64 } from "./pty-scripts";

export interface ClaudeCommandOptions {
	useIdeFlag: boolean; // --ide for MCP integration
	continueSession: boolean; // --continue for resuming last conversation
}

export interface TerminalProcessOptions {
	cwd: string;
	cols: number;
	rows: number;
	claudeOptions: ClaudeCommandOptions;
	onData: (data: string) => void;
	onExit: (code: number | null, signal: string | null) => void;
	onError: (err: Error) => void;
}

/**
 * Dependencies that can be injected for testing.
 */
export interface TerminalProcessDeps {
	platform: typeof process.platform;
	spawn: (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcess;
	execSync: (command: string, options: { encoding: "utf8"; timeout: number }) => string;
	writeFileSync: (path: string, data: string, options: { mode: number }) => void;
	tmpdir: () => string;
	env: typeof process.env;
}

/**
 * Default dependencies using real Node.js modules.
 */
export const defaultDeps: TerminalProcessDeps = {
	platform: process.platform,
	spawn,
	execSync,
	writeFileSync: fs.writeFileSync,
	tmpdir: os.tmpdir,
	env: process.env,
};

export class TerminalProcess {
	private proc: ChildProcess | null = null;
	private stdoutDecoder: StringDecoder | null = null;
	private stderrDecoder: StringDecoder | null = null;
	private readonly isWindows: boolean;
	private readonly deps: TerminalProcessDeps;

	constructor(deps: TerminalProcessDeps = defaultDeps) {
		this.deps = deps;
		this.isWindows = deps.platform === "win32";
	}

	/**
	 * Build the Claude CLI command string from options.
	 */
	buildClaudeCommand(options: ClaudeCommandOptions): string {
		const args: string[] = [];
		if (options.useIdeFlag) args.push("--ide");
		if (options.continueSession) args.push("--continue");
		return args.length > 0 ? `claude ${args.join(" ")}` : "claude";
	}

	start(options: TerminalProcessOptions): void {
		this.stop();

		const { cwd, cols, rows, claudeOptions, onData, onExit, onError } = options;

		const shell = this.isWindows
			? this.deps.env.COMSPEC || "cmd.exe"
			: this.deps.env.SHELL || "/bin/bash";

		// Decode and write PTY script to temp file
		const scriptB64 = this.isWindows ? WIN_PTY_SCRIPT_B64 : PTY_SCRIPT_B64;
		const scriptName = this.isWindows ? "claude_sidebar_win.py" : "claude_sidebar_pty.py";
		const ptyPath = path.join(this.deps.tmpdir(), scriptName);

		// Always write to ensure current version (overwrites stale cached copies)
		const ptyScript = Buffer.from(scriptB64, "base64").toString("utf-8");
		this.deps.writeFileSync(ptyPath, ptyScript, { mode: 0o755 });

		// Use 'python' on Windows (works with both python.org and Microsoft Store installs)
		const cmd = this.isWindows ? "python" : "python3";

		// Build claude command with optional flags
		const claudeCmd = this.buildClaudeCommand(claudeOptions);

		const args = this.isWindows
			? [ptyPath, String(cols), String(rows), shell]
			: [ptyPath, String(cols), String(rows), shell, "-lc", `${claudeCmd} || true; exec $SHELL -i`];

		// Get PATH from user's login shell (GUI apps don't inherit shell config)
		const shellEnv: typeof process.env = { ...this.deps.env, TERM: "xterm-256color" };
		if (!this.isWindows) {
			try {
				const shellOutput = this.deps.execSync(`${shell} -lic 'echo "__PATH__"; echo "$PATH"'`, {
					encoding: "utf8",
					timeout: 2000,
				});
				// Extract PATH from after the marker (shell integration escapes pollute early output)
				const shellPath = shellOutput.split("__PATH__\n")[1]?.trim().split("\n")[0];
				if (shellPath) {
					shellEnv.PATH = shellPath;
				}
			} catch {
				// Fall back to process.env.PATH if shell init fails
			}
		}

		this.proc = this.deps.spawn(cmd, args, {
			cwd,
			env: shellEnv,
			stdio: ["pipe", "pipe", "pipe"],
		});

		// Use StringDecoder to properly handle UTF-8 boundaries across chunks
		this.stdoutDecoder = new StringDecoder("utf8");
		this.stderrDecoder = new StringDecoder("utf8");

		this.proc.stdout?.on("data", (data: Buffer) => {
			onData(this.stdoutDecoder!.write(data));
		});

		this.proc.stderr?.on("data", (data: Buffer) => {
			onData(this.stderrDecoder!.write(data));
		});

		this.proc.on("exit", (code, signal) => {
			this.proc = null;
			onExit(code, signal);
		});

		this.proc.on("error", (err: Error) => {
			onError(err);
		});

		// Windows still needs auto-launch since we can't use exec there
		if (this.isWindows) {
			setTimeout(() => {
				this.write(`${claudeCmd}\r`);
			}, 1000);
		}
	}

	write(data: string): void {
		if (this.proc && !this.proc.killed) {
			this.proc.stdin?.write(data);
		}
	}

	resize(cols: number, rows: number): void {
		if (this.proc && !this.proc.killed) {
			this.proc.stdin?.write(`\x1b]RESIZE;${cols};${rows}\x07`);
		}
	}

	stop(): void {
		if (this.proc && !this.proc.killed) {
			this.proc.kill("SIGTERM");
			this.proc = null;
		}

		// Flush any remaining buffered bytes from decoders
		if (this.stdoutDecoder) {
			this.stdoutDecoder.end();
			this.stdoutDecoder = null;
		}
		if (this.stderrDecoder) {
			this.stderrDecoder.end();
			this.stderrDecoder = null;
		}
	}

	get isRunning(): boolean {
		return this.proc !== null && !this.proc.killed;
	}

	get platform(): "win32" | "darwin" | "linux" {
		return this.isWindows ? "win32" : (this.deps.platform as "darwin" | "linux");
	}
}

export function connectTerminalToProcess(
	term: Terminal,
	proc: TerminalProcess,
	filterFocusSequences: boolean = true
): void {
	term.onData((data) => {
		if (proc.isRunning) {
			// Filter out focus in/out sequences before sending to shell
			const filtered = filterFocusSequences
				// eslint-disable-next-line no-control-regex -- Intentional escape sequence filtering
				? data.replace(/\x1b\[I/g, "").replace(/\x1b\[O/g, "")
				: data;
			if (filtered) {
				proc.write(filtered);
			}
		}
	});

	term.onResize(({ cols, rows }) => {
		proc.resize(cols, rows);
	});
}
