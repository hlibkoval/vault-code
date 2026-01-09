import type {Terminal} from "@xterm/xterm";

/**
 * Mitigates Ink TUI scroll-to-top bug (Claude Code issue #826).
 * When Ink redraws, it can cause the terminal to jump to the top.
 * Detects suspicious jumps and restores the previous scroll position.
 */
export class ScrollPositionManager {
	private lastStableScrollPos = 0;
	private scrollRestoreTimeout: ReturnType<typeof setTimeout> | null = null;
	private scrollLockUntil = 0;

	private static readonly THRESHOLD = 10;
	private static readonly LOCK_DURATION = 200;
	private static readonly RESTORE_DELAY = 50;

	attach(terminal: Terminal): void {
		terminal.onScroll((newPos) => this.handleScroll(terminal, newPos));
	}

	private handleScroll(terminal: Terminal, newPos: number): void {
		const now = Date.now();

		// If we jumped to top from a significant scroll position, restore
		if (newPos === 0 && this.lastStableScrollPos > ScrollPositionManager.THRESHOLD) {
			if (this.scrollRestoreTimeout) {
				clearTimeout(this.scrollRestoreTimeout);
			}
			this.scrollLockUntil = now + ScrollPositionManager.LOCK_DURATION;
			const restorePos = this.lastStableScrollPos;
			this.scrollRestoreTimeout = setTimeout(() => {
				terminal.scrollToLine(restorePos);
				this.scrollRestoreTimeout = null;
			}, ScrollPositionManager.RESTORE_DELAY);
		} else if (newPos > 0 && now > this.scrollLockUntil) {
			// Update stable position only when not locked (user scrolling normally)
			this.lastStableScrollPos = newPos;
		}
	}

	dispose(): void {
		if (this.scrollRestoreTimeout) {
			clearTimeout(this.scrollRestoreTimeout);
			this.scrollRestoreTimeout = null;
		}
	}
}
