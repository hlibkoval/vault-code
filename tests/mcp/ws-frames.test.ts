import { describe, it, expect } from "vitest";
import {
	parseFrames,
	createFrame,
	createCloseFrame,
	WS_OPCODE_TEXT,
	WS_OPCODE_CLOSE,
	WS_OPCODE_PING,
	WS_OPCODE_PONG,
	WS_GUID,
} from "../../src/mcp/ws-frames";

describe("ws-frames constants", () => {
	it("exports correct opcodes", () => {
		expect(WS_OPCODE_TEXT).toBe(0x01);
		expect(WS_OPCODE_CLOSE).toBe(0x08);
		expect(WS_OPCODE_PING).toBe(0x09);
		expect(WS_OPCODE_PONG).toBe(0x0a);
	});

	it("exports WebSocket GUID", () => {
		expect(WS_GUID).toBe("258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
	});
});

describe("parseFrames", () => {
	describe("small payload (<126 bytes)", () => {
		it("parses unmasked text frame", () => {
			// Create a frame: FIN=1, opcode=1 (text), no mask, payload="hello"
			const payload = Buffer.from("hello", "utf-8");
			const frame = Buffer.alloc(2 + payload.length);
			frame[0] = 0x81; // FIN + text opcode
			frame[1] = payload.length; // no mask bit
			payload.copy(frame, 2);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_TEXT);
			expect(result[0]!.payload.toString("utf-8")).toBe("hello");
		});

		it("parses masked text frame", () => {
			const message = "hello";
			const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
			const payload = Buffer.from(message, "utf-8");

			// Mask the payload
			const maskedPayload = Buffer.from(payload);
			for (let i = 0; i < maskedPayload.length; i++) {
				maskedPayload[i] = maskedPayload[i]! ^ maskKey[i % 4]!;
			}

			// Create frame with mask
			const frame = Buffer.alloc(2 + 4 + payload.length);
			frame[0] = 0x81; // FIN + text opcode
			frame[1] = 0x80 | payload.length; // mask bit + length
			maskKey.copy(frame, 2);
			maskedPayload.copy(frame, 6);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_TEXT);
			expect(result[0]!.payload.toString("utf-8")).toBe("hello");
		});

		it("parses empty payload", () => {
			const frame = Buffer.from([0x81, 0x00]); // FIN + text, length=0

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_TEXT);
			expect(result[0]!.payload.length).toBe(0);
		});
	});

	describe("medium payload (126-65535 bytes)", () => {
		it("parses 16-bit extended length", () => {
			const payloadSize = 256; // > 125
			const payload = Buffer.alloc(payloadSize, "x");

			const frame = Buffer.alloc(4 + payloadSize);
			frame[0] = 0x81; // FIN + text
			frame[1] = 126; // Extended 16-bit length indicator
			frame.writeUInt16BE(payloadSize, 2);
			payload.copy(frame, 4);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_TEXT);
			expect(result[0]!.payload.length).toBe(payloadSize);
		});

		it("parses exactly 126 bytes", () => {
			const payloadSize = 126;
			const payload = Buffer.alloc(payloadSize, "a");

			const frame = Buffer.alloc(4 + payloadSize);
			frame[0] = 0x81;
			frame[1] = 126;
			frame.writeUInt16BE(payloadSize, 2);
			payload.copy(frame, 4);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.payload.length).toBe(126);
		});
	});

	describe("large payload (>65535 bytes)", () => {
		it("parses 64-bit extended length", () => {
			const payloadSize = 70000; // > 65535
			const payload = Buffer.alloc(payloadSize, "y");

			const frame = Buffer.alloc(10 + payloadSize);
			frame[0] = 0x81;
			frame[1] = 127; // Extended 64-bit length indicator
			frame.writeBigUInt64BE(BigInt(payloadSize), 2);
			payload.copy(frame, 10);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_TEXT);
			expect(result[0]!.payload.length).toBe(payloadSize);
		});
	});

	describe("different opcodes", () => {
		it("parses ping frame", () => {
			const frame = Buffer.from([0x89, 0x00]); // FIN + ping, length=0

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_PING);
		});

		it("parses pong frame", () => {
			const payload = Buffer.from("ping-data");
			const frame = Buffer.alloc(2 + payload.length);
			frame[0] = 0x8a; // FIN + pong
			frame[1] = payload.length;
			payload.copy(frame, 2);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_PONG);
			expect(result[0]!.payload.toString()).toBe("ping-data");
		});

		it("parses close frame with code and reason", () => {
			const code = 1000;
			const reason = "Normal closure";
			const reasonBuf = Buffer.from(reason, "utf-8");
			const payload = Buffer.alloc(2 + reasonBuf.length);
			payload.writeUInt16BE(code, 0);
			reasonBuf.copy(payload, 2);

			const frame = Buffer.alloc(2 + payload.length);
			frame[0] = 0x88; // FIN + close
			frame[1] = payload.length;
			payload.copy(frame, 2);

			const result = parseFrames(frame);

			expect(result).toHaveLength(1);
			expect(result[0]!.opcode).toBe(WS_OPCODE_CLOSE);
			expect(result[0]!.payload.readUInt16BE(0)).toBe(1000);
			expect(result[0]!.payload.subarray(2).toString()).toBe("Normal closure");
		});
	});

	describe("edge cases", () => {
		it("handles empty buffer", () => {
			const result = parseFrames(Buffer.alloc(0));
			expect(result).toHaveLength(0);
		});

		it("handles incomplete header (1 byte)", () => {
			const result = parseFrames(Buffer.from([0x81]));
			expect(result).toHaveLength(0);
		});

		it("handles incomplete 16-bit length", () => {
			const frame = Buffer.from([0x81, 126, 0x00]); // Missing second byte of length
			const result = parseFrames(frame);
			expect(result).toHaveLength(0);
		});

		it("handles incomplete 64-bit length", () => {
			const frame = Buffer.from([0x81, 127, 0x00, 0x00]); // Incomplete 64-bit length
			const result = parseFrames(frame);
			expect(result).toHaveLength(0);
		});

		it("handles incomplete mask key", () => {
			const frame = Buffer.from([0x81, 0x85, 0x12, 0x34]); // Only 2 of 4 mask bytes
			const result = parseFrames(frame);
			expect(result).toHaveLength(0);
		});

		it("handles truncated payload", () => {
			const frame = Buffer.from([0x81, 0x05, 0x68, 0x65]); // Says 5 bytes, only has 2
			const result = parseFrames(frame);
			expect(result).toHaveLength(0);
		});

		it("parses multiple frames in one buffer", () => {
			const frame1 = Buffer.from([0x81, 0x05, ...Buffer.from("hello")]);
			const frame2 = Buffer.from([0x81, 0x05, ...Buffer.from("world")]);
			const combined = Buffer.concat([frame1, frame2]);

			const result = parseFrames(combined);

			expect(result).toHaveLength(2);
			expect(result[0]!.payload.toString()).toBe("hello");
			expect(result[1]!.payload.toString()).toBe("world");
		});

		it("parses complete frames and ignores trailing incomplete frame", () => {
			const frame1 = Buffer.from([0x81, 0x05, ...Buffer.from("hello")]);
			const incomplete = Buffer.from([0x81, 0x0a]); // Claims 10 bytes but has none
			const combined = Buffer.concat([frame1, incomplete]);

			const result = parseFrames(combined);

			expect(result).toHaveLength(1);
			expect(result[0]!.payload.toString()).toBe("hello");
		});
	});
});

describe("createFrame", () => {
	describe("small payload (<126 bytes)", () => {
		it("creates frame with small text payload", () => {
			const payload = Buffer.from("hello", "utf-8");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame[0]).toBe(0x81); // FIN + text
			expect(frame[1]).toBe(5); // length
			expect(frame.subarray(2).toString("utf-8")).toBe("hello");
		});

		it("creates frame with empty payload", () => {
			const payload = Buffer.alloc(0);
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame.length).toBe(2);
			expect(frame[0]).toBe(0x81);
			expect(frame[1]).toBe(0);
		});

		it("creates frame with exactly 125 bytes", () => {
			const payload = Buffer.alloc(125, "x");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame.length).toBe(2 + 125);
			expect(frame[1]).toBe(125);
		});
	});

	describe("medium payload (126-65535 bytes)", () => {
		it("creates frame with 16-bit extended length", () => {
			const payload = Buffer.alloc(200, "x");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame.length).toBe(4 + 200);
			expect(frame[0]).toBe(0x81);
			expect(frame[1]).toBe(126);
			expect(frame.readUInt16BE(2)).toBe(200);
		});

		it("creates frame with exactly 126 bytes", () => {
			const payload = Buffer.alloc(126, "x");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame[1]).toBe(126); // Extended length indicator
			expect(frame.readUInt16BE(2)).toBe(126);
		});

		it("creates frame with exactly 65535 bytes", () => {
			const payload = Buffer.alloc(65535, "x");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame[1]).toBe(126);
			expect(frame.readUInt16BE(2)).toBe(65535);
		});
	});

	describe("large payload (>65535 bytes)", () => {
		it("creates frame with 64-bit extended length", () => {
			const payload = Buffer.alloc(70000, "x");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame.length).toBe(10 + 70000);
			expect(frame[0]).toBe(0x81);
			expect(frame[1]).toBe(127);
			expect(Number(frame.readBigUInt64BE(2))).toBe(70000);
		});

		it("creates frame with exactly 65536 bytes", () => {
			const payload = Buffer.alloc(65536, "x");
			const frame = createFrame(WS_OPCODE_TEXT, payload);

			expect(frame[1]).toBe(127); // 64-bit length indicator
			expect(Number(frame.readBigUInt64BE(2))).toBe(65536);
		});
	});

	describe("different opcodes", () => {
		it("creates ping frame", () => {
			const payload = Buffer.from("ping");
			const frame = createFrame(WS_OPCODE_PING, payload);

			expect(frame[0]).toBe(0x89); // FIN + ping
		});

		it("creates pong frame", () => {
			const payload = Buffer.from("pong");
			const frame = createFrame(WS_OPCODE_PONG, payload);

			expect(frame[0]).toBe(0x8a); // FIN + pong
		});

		it("creates close frame", () => {
			const payload = Buffer.alloc(2);
			payload.writeUInt16BE(1000, 0);
			const frame = createFrame(WS_OPCODE_CLOSE, payload);

			expect(frame[0]).toBe(0x88); // FIN + close
		});
	});

	describe("round-trip", () => {
		it("creates frame that can be parsed back", () => {
			const originalPayload = Buffer.from("test message");
			const frame = createFrame(WS_OPCODE_TEXT, originalPayload);
			const parsed = parseFrames(frame);

			expect(parsed).toHaveLength(1);
			expect(parsed[0]!.opcode).toBe(WS_OPCODE_TEXT);
			expect(parsed[0]!.payload.toString()).toBe("test message");
		});

		it("handles round-trip with large payload", () => {
			const originalPayload = Buffer.alloc(70000, "x");
			const frame = createFrame(WS_OPCODE_TEXT, originalPayload);
			const parsed = parseFrames(frame);

			expect(parsed).toHaveLength(1);
			expect(parsed[0]!.payload.length).toBe(70000);
		});
	});
});

describe("createCloseFrame", () => {
	it("creates close frame with code and reason", () => {
		const frame = createCloseFrame(1000, "Normal closure");

		expect(frame[0]).toBe(0x88); // FIN + close opcode

		// Parse it back
		const parsed = parseFrames(frame);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]!.opcode).toBe(WS_OPCODE_CLOSE);

		const payload = parsed[0]!.payload;
		expect(payload.readUInt16BE(0)).toBe(1000);
		expect(payload.subarray(2).toString("utf-8")).toBe("Normal closure");
	});

	it("creates close frame with empty reason", () => {
		const frame = createCloseFrame(1001, "");

		const parsed = parseFrames(frame);
		expect(parsed).toHaveLength(1);

		const payload = parsed[0]!.payload;
		expect(payload.readUInt16BE(0)).toBe(1001);
		expect(payload.length).toBe(2); // Just the code
	});

	it("creates close frame with different codes", () => {
		const testCases = [
			{ code: 1000, name: "Normal Closure" },
			{ code: 1001, name: "Going Away" },
			{ code: 1002, name: "Protocol Error" },
			{ code: 1003, name: "Unsupported Data" },
			{ code: 1008, name: "Policy Violation" },
			{ code: 1011, name: "Server Error" },
		];

		for (const { code, name } of testCases) {
			const frame = createCloseFrame(code, name);
			const parsed = parseFrames(frame);
			expect(parsed[0]!.payload.readUInt16BE(0)).toBe(code);
		}
	});

	it("handles UTF-8 reason text", () => {
		const reason = "Goodbye: \u{1F44B}"; // Wave emoji
		const frame = createCloseFrame(1000, reason);

		const parsed = parseFrames(frame);
		const payload = parsed[0]!.payload;
		expect(payload.subarray(2).toString("utf-8")).toBe(reason);
	});
});
