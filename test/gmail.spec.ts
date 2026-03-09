import { describe, expect, it } from 'vitest';
import { base64urlToArrayBuffer } from '../src/utils/base64url';

describe('base64urlToArrayBuffer', () => {
	it('decodes base64url content', () => {
		const encoded = 'aGVsbG8td29ybGQ';
		const buf = base64urlToArrayBuffer(encoded);
		const text = new TextDecoder().decode(buf);
		expect(text).toBe('hello-world');
	});
});
