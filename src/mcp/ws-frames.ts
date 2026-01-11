/**
 * WebSocket frame utilities for MCP server.
 * Extracted for testability - pure functions with no side effects.
 */

// WebSocket frame opcodes
export const WS_OPCODE_TEXT = 0x01;
export const WS_OPCODE_CLOSE = 0x08;
export const WS_OPCODE_PING = 0x09;
export const WS_OPCODE_PONG = 0x0a;

// WebSocket GUID for handshake
export const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export interface WebSocketFrame {
	opcode: number;
	payload: Buffer;
}

/**
 * Parse WebSocket frames from buffer.
 * Handles variable payload lengths and optional masking.
 */
export function parseFrames(data: Buffer): WebSocketFrame[] {
	const frames: WebSocketFrame[] = [];
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
 * Create a WebSocket frame with proper header.
 * Server frames are never masked (per RFC 6455).
 */
export function createFrame(opcode: number, payload: Buffer): Buffer {
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

	return Buffer.concat([header, payload]);
}

/**
 * Create a WebSocket close frame with status code and reason.
 */
export function createCloseFrame(code: number, reason: string): Buffer {
	const reasonBuf = Buffer.from(reason, "utf-8");
	const payload = Buffer.alloc(2 + reasonBuf.length);
	payload.writeUInt16BE(code, 0);
	reasonBuf.copy(payload, 2);
	return createFrame(WS_OPCODE_CLOSE, payload);
}
