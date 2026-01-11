import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {ScrollPositionManager} from "../../src/view/scroll-position-manager";
import type {Terminal} from "@xterm/xterm";

describe("ScrollPositionManager", () => {
	let manager: ScrollPositionManager;
	let mockTerminal: Partial<Terminal>;
	let scrollHandler: ((newPos: number) => void) | null = null;

	beforeEach(() => {
		vi.useFakeTimers();
		manager = new ScrollPositionManager();

		mockTerminal = {
			onScroll: vi.fn((handler) => {
				scrollHandler = handler;
				return {dispose: vi.fn()};
			}),
			scrollToLine: vi.fn(),
		};
	});

	afterEach(() => {
		vi.useRealTimers();
		manager.dispose();
		scrollHandler = null;
	});

	describe("attach", () => {
		it("should register scroll handler on terminal", () => {
			manager.attach(mockTerminal as Terminal);

			expect(mockTerminal.onScroll).toHaveBeenCalled();
			expect(scrollHandler).toBeInstanceOf(Function);
		});
	});

	describe("scroll behavior", () => {
		beforeEach(() => {
			manager.attach(mockTerminal as Terminal);
		});

		it("should track stable scroll position", () => {
			// Scroll to position 50
			scrollHandler!(50);

			// Scroll to position 100
			scrollHandler!(100);

			// No restore should happen - just normal scrolling
			expect(mockTerminal.scrollToLine).not.toHaveBeenCalled();
		});

		it("should restore position when jumping from significant scroll to top", () => {
			// Build up stable position beyond threshold (10)
			scrollHandler!(50);

			// Simulate Ink bug - jump to top
			scrollHandler!(0);

			// Should schedule restore after 50ms
			vi.advanceTimersByTime(50);

			expect(mockTerminal.scrollToLine).toHaveBeenCalledWith(50);
		});

		it("should not restore if scroll position was below threshold", () => {
			// Position below threshold (10)
			scrollHandler!(5);

			// Jump to top
			scrollHandler!(0);

			vi.advanceTimersByTime(50);

			expect(mockTerminal.scrollToLine).not.toHaveBeenCalled();
		});

		it("should not restore if scroll position equals threshold", () => {
			// Position at threshold exactly
			scrollHandler!(10);

			// Jump to top
			scrollHandler!(0);

			vi.advanceTimersByTime(50);

			expect(mockTerminal.scrollToLine).not.toHaveBeenCalled();
		});

		it("should restore if scroll position exceeds threshold", () => {
			// Position just above threshold
			scrollHandler!(11);

			// Jump to top
			scrollHandler!(0);

			vi.advanceTimersByTime(50);

			expect(mockTerminal.scrollToLine).toHaveBeenCalledWith(11);
		});

		it("should debounce multiple rapid jumps to top", () => {
			scrollHandler!(100);

			// Multiple rapid jumps
			scrollHandler!(0);
			scrollHandler!(0);
			scrollHandler!(0);

			vi.advanceTimersByTime(50);

			// Should only restore once
			expect(mockTerminal.scrollToLine).toHaveBeenCalledTimes(1);
		});

		it("should lock scroll position during restore window", () => {
			scrollHandler!(100);
			scrollHandler!(0);

			// Advance partially through lock duration (200ms)
			vi.advanceTimersByTime(100);

			// Try to update stable position during lock
			scrollHandler!(200);

			// Trigger another jump to top
			scrollHandler!(0);

			// Complete both restore delays
			vi.advanceTimersByTime(50);

			// Should restore to original position (100), not 200
			// because scrolling during lock doesn't update stable position
			expect(mockTerminal.scrollToLine).toHaveBeenLastCalledWith(100);
		});

		it("should resume tracking after lock duration expires", () => {
			scrollHandler!(100);
			scrollHandler!(0);

			// Wait for lock to expire (200ms) plus restore delay
			vi.advanceTimersByTime(250);

			// Now scroll to new position
			scrollHandler!(150);

			// Jump to top again
			scrollHandler!(0);
			vi.advanceTimersByTime(50);

			// Should restore to new stable position
			expect(mockTerminal.scrollToLine).toHaveBeenLastCalledWith(150);
		});

		it("should not update stable position when at 0", () => {
			// Scroll to position above threshold
			scrollHandler!(100);

			// Jump to 0 (triggers restore)
			scrollHandler!(0);
			vi.advanceTimersByTime(50);
			expect(mockTerminal.scrollToLine).toHaveBeenCalledWith(100);

			// Wait for lock to expire
			vi.advanceTimersByTime(200);

			// Scroll to new position (should update stable position)
			scrollHandler!(50);

			// Jump to 0 again
			scrollHandler!(0);
			vi.advanceTimersByTime(50);

			// Should restore to new stable position (50)
			expect(mockTerminal.scrollToLine).toHaveBeenLastCalledWith(50);
		});
	});

	describe("dispose", () => {
		it("should clear pending timeout", () => {
			manager.attach(mockTerminal as Terminal);

			scrollHandler!(100);
			scrollHandler!(0);

			// Dispose before timeout fires
			manager.dispose();
			vi.advanceTimersByTime(100);

			// Should not have restored
			expect(mockTerminal.scrollToLine).not.toHaveBeenCalled();
		});

		it("should be safe to call multiple times", () => {
			manager.attach(mockTerminal as Terminal);

			expect(() => {
				manager.dispose();
				manager.dispose();
			}).not.toThrow();
		});

		it("should be safe to call before attach", () => {
			expect(() => {
				manager.dispose();
			}).not.toThrow();
		});
	});
});
