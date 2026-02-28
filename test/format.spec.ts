import { describe, expect, it } from 'vitest';
import { findLongestValidMdV2Prefix } from '../src/utils';

describe('findLongestValidMdV2Prefix', () => {
	it('returns full length for balanced entities', () => {
		const md = '*bold* _italic_ ~strike~';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('returns prefix before unmatched entity', () => {
		const md = 'hello *world';
		expect(findLongestValidMdV2Prefix(md)).toBe('hello '.length);
	});

	it('treats double-star as two bold delimiters (empty bold + plain text)', () => {
		const md = 'hello **world';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('accepts balanced double-star token', () => {
		const md = 'hello **world**';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('handles escaped markers', () => {
		const md = 'hello \\*world\\*';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('ignores entities inside fenced code', () => {
		const md = '```code * _ ~``` tail';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('handles underline, spoiler and strikethrough entities', () => {
		const md = '__u__ ||spoiler|| ~s~';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('handles markdown links', () => {
		const md = 'ok [x](https://example.com)';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('returns safe prefix for unclosed link URL', () => {
		const md = 'ok [x](https://example.com';
		expect(findLongestValidMdV2Prefix(md)).toBe('ok '.length);
	});

	it('handles custom emoji links', () => {
		const md = '![ok](tg://emoji?id=5368324170671202286)';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('keeps expandable blockquote marker valid at line end', () => {
		const md = '>expandable blockquote||';
		expect(findLongestValidMdV2Prefix(md)).toBe(md.length);
	});

	it('drops trailing dangling escape', () => {
		const md = 'abc\\';
		expect(findLongestValidMdV2Prefix(md)).toBe('abc'.length);
	});
});
