/*--------------------------------------------------------------------------------------
 *  Agentic AI — apply search/replace blocks to file content (fuzzy ORIGINAL match)
 *--------------------------------------------------------------------------------------*/

import { normalizeSearchReplaceBlocks } from './editValidator.js';

const ORIGINAL = '<<<<<<< ORIGINAL';
const DIVIDER = '=======';
const FINAL = '>>>>>>> UPDATED';

interface ParsedBlock {
	orig: string;
	final: string;
}

function parseBlocks(blocks: string): ParsedBlock[] {
	const normalized = normalizeSearchReplaceBlocks(blocks);
	const out: ParsedBlock[] = [];
	let i = 0;
	while (i < normalized.length) {
		const origIdx = normalized.indexOf(ORIGINAL, i);
		if (origIdx === -1) {
			break;
		}
		let pos = origIdx + ORIGINAL.length;
		if (normalized[pos] === '\n') {
			pos++;
		}
		const divIdx = normalized.indexOf(DIVIDER, pos);
		if (divIdx === -1) {
			break;
		}
		const origText = normalized.slice(pos, divIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
		pos = divIdx + DIVIDER.length;
		if (normalized[pos] === '\n') {
			pos++;
		}
		const finalIdx = normalized.indexOf(FINAL, pos);
		if (finalIdx === -1) {
			break;
		}
		const finalText = normalized.slice(pos, finalIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
		out.push({ orig: origText, final: finalText });
		i = finalIdx + FINAL.length;
	}
	return out;
}

function findOrigInFile(orig: string, fileContent: string): { start: number; end: number } | undefined {
	if (!orig.trim()) {
		return undefined;
	}
	const direct = fileContent.indexOf(orig);
	if (direct >= 0) {
		return { start: direct, end: direct + orig.length };
	}
	const normOrig = orig.replace(/\r\n/g, '\n');
	const normFile = fileContent.replace(/\r\n/g, '\n');
	const idx = normFile.indexOf(normOrig);
	if (idx >= 0) {
		return { start: idx, end: idx + normOrig.length };
	}
	const trimOrig = orig.split('\n').map(l => l.trimEnd()).join('\n');
	const trimFile = fileContent.split('\n').map(l => l.trimEnd()).join('\n');
	const tidx = trimFile.indexOf(trimOrig);
	if (tidx >= 0) {
		return { start: tidx, end: tidx + trimOrig.length };
	}
	return undefined;
}

/** Best-effort apply blocks; used to escalate propose_file_edit → write_file when format is close. */
export function tryApplyBlocksToFileContent(
	fileContent: string,
	blocks: string,
): { ok: true; content: string } | { ok: false; error: string } {
	const parsed = parseBlocks(blocks);
	if (!parsed.length) {
		return { ok: false, error: 'No parseable edit blocks' };
	}
	let result = fileContent.replace(/\r\n/g, '\n');
	const replacements: { start: number; end: number; final: string }[] = [];

	for (const block of parsed) {
		if (!block.final.trim()) {
			return { ok: false, error: 'Empty UPDATED section' };
		}
		if (!block.orig.trim()) {
			return { ok: true, content: block.final };
		}
		const span = findOrigInFile(block.orig, result);
		if (!span) {
			return { ok: false, error: 'ORIGINAL text not found in file (copy exact lines from read_file)' };
		}
		replacements.push({ start: span.start, end: span.end, final: block.final });
	}

	replacements.sort((a, b) => a.start - b.start);
	for (let j = 1; j < replacements.length; j++) {
		if (replacements[j]!.start < replacements[j - 1]!.end) {
			return { ok: false, error: 'Overlapping edit blocks' };
		}
	}
	for (let k = replacements.length - 1; k >= 0; k--) {
		const r = replacements[k]!;
		result = result.slice(0, r.start) + r.final + result.slice(r.end);
	}
	return { ok: true, content: result };
}
