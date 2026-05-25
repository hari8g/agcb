/*--------------------------------------------------------------------------------------
 *  Agentic AI — validate Void-style search/replace blocks before approval
 *--------------------------------------------------------------------------------------*/

const ORIGINAL = '<<<<<<< ORIGINAL';
const DIVIDER = '=======';
const FINAL = '>>>>>>> UPDATED';

export interface EditValidationResult {
	ok: boolean;
	error?: string;
	blockCount: number;
}

/** Fix common LLM mistakes before validation (git markers, missing labels, fences). */
export function normalizeSearchReplaceBlocks(raw: string): string {
	let blocks = raw.trim();
	if (!blocks) {
		return blocks;
	}

	if (!blocks.includes('\n') && blocks.includes('\\n')) {
		blocks = blocks.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
	}

	const fence = blocks.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```\s*$/);
	if (fence) {
		blocks = fence[1].trim();
	}

	if (!blocks.includes(ORIGINAL)) {
		blocks = blocks.replace(/<<<<<<<(?!\s+ORIGINAL)/g, '<<<<<<< ORIGINAL');
	}

	if (blocks.includes(DIVIDER) && !blocks.includes(FINAL)) {
		blocks = blocks.replace(/>>>>>>>(?!\s+UPDATED)\s*[^\n]*/g, '>>>>>>> UPDATED');
	}

	if (!blocks.includes(ORIGINAL) && blocks.includes(DIVIDER)) {
		const parts = blocks.split(/\n=======\n/);
		if (parts.length === 2) {
			const before = parts[0].trim();
			const after = parts[1].replace(/\n?>>>>>>>[^\n]*\s*$/m, '').trim();
			if (after) {
				blocks = before
					? `${ORIGINAL}\n${before}\n${DIVIDER}\n${after}\n${FINAL}`
					: `${ORIGINAL}\n${DIVIDER}\n${after}\n${FINAL}`;
			}
		}
	}

	if (!blocks.includes(ORIGINAL) && /^@@\s/m.test(blocks)) {
		const converted = tryConvertUnifiedDiff(blocks);
		if (converted) {
			blocks = converted;
		}
	}

	// Bare file body (no markers) — treat as full-file write
	if (!blocks.includes(ORIGINAL) && !blocks.includes(DIVIDER) && blocks.length > 0 && !blocks.startsWith('@@')) {
		return buildCreateFileBlocks(blocks);
	}

	return blocks;
}

function tryConvertUnifiedDiff(diff: string): string | undefined {
	const lines = diff.split('\n');
	const blocks: string[] = [];
	let orig: string[] = [];
	let updated: string[] = [];
	let inHunk = false;

	const flush = () => {
		if (orig.length && (updated.length || orig.length)) {
			blocks.push(
				`${ORIGINAL}\n${orig.join('\n')}\n${DIVIDER}\n${(updated.length ? updated : orig).join('\n')}\n${FINAL}`,
			);
		}
		orig = [];
		updated = [];
	};

	for (const line of lines) {
		if (line.startsWith('@@')) {
			if (inHunk) {
				flush();
			}
			inHunk = true;
			continue;
		}
		if (!inHunk || line.startsWith('---') || line.startsWith('+++')) {
			continue;
		}
		if (line.startsWith('-')) {
			orig.push(line.slice(1));
		} else if (line.startsWith('+')) {
			updated.push(line.slice(1));
		} else if (line.startsWith(' ')) {
			const t = line.slice(1);
			orig.push(t);
			updated.push(t);
		}
	}
	if (inHunk) {
		flush();
	}
	return blocks.length ? blocks.join('\n\n') : undefined;
}

export interface ValidateSearchReplaceOptions {
	/** When true, a block may have an empty ORIGINAL section (new file creation). */
	allowCreate?: boolean;
	/** When true, accept well-formed markers even if ORIGINAL is empty on existing files (apply may still fuzzy-match). */
	lenient?: boolean;
}

/** Void blocks for creating a new file (empty ORIGINAL, full UPDATED). */
export function buildCreateFileBlocks(content: string): string {
	const body = content.replace(/\r\n/g, '\n').replace(/\r$/, '\n').trimEnd();
	return `${ORIGINAL}\n${DIVIDER}\n${body}\n${FINAL}`;
}

/** Extract full file content from create-style blocks. */
/** Fix LLM blocks that pasted read_file errors into ORIGINAL when creating a new file. */
export function coerceBlocksForNewFile(blocks: string): string | undefined {
	const normalized = normalizeSearchReplaceBlocks(blocks);
	if (!/Error:\s*file not found/i.test(normalized)) {
		return undefined;
	}
	const divIdx = normalized.indexOf(DIVIDER);
	const finalIdx = normalized.indexOf(FINAL, divIdx);
	if (divIdx === -1 || finalIdx === -1) {
		return undefined;
	}
	let pos = divIdx + DIVIDER.length;
	if (normalized[pos] === '\n') {
		pos++;
	}
	const finalText = normalized.slice(pos, finalIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
	if (finalText.trim() && !/^Error:/i.test(finalText.trim())) {
		return buildCreateFileBlocks(finalText);
	}
	return undefined;
}

export function extractCreateFileContent(blocks: string): string | undefined {
	const normalized = normalizeSearchReplaceBlocks(blocks);
	const v = validateSearchReplaceBlocksNormalized(normalized, { allowCreate: true });
	if (!v.ok || v.blockCount !== 1) {
		return undefined;
	}
	const divIdx = normalized.indexOf(DIVIDER);
	const finalIdx = normalized.indexOf(FINAL, divIdx);
	if (divIdx === -1 || finalIdx === -1) {
		return undefined;
	}
	let pos = divIdx + DIVIDER.length;
	if (normalized[pos] === '\n') {
		pos++;
	}
	return normalized.slice(pos, finalIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

export function validateSearchReplaceBlocks(
	blocks: string,
	opts?: ValidateSearchReplaceOptions,
): EditValidationResult {
	const normalized = normalizeSearchReplaceBlocks(blocks);
	return validateSearchReplaceBlocksNormalized(normalized, opts);
}

function validateSearchReplaceBlocksNormalized(
	blocks: string,
	opts?: ValidateSearchReplaceOptions,
): EditValidationResult {
	const trimmed = blocks.trim();
	if (!trimmed) {
		return { ok: false, error: 'searchReplaceBlocks is empty', blockCount: 0 };
	}
	if (trimmed === '[object Object]' || trimmed.includes('[object Object]')) {
		return {
			ok: false,
			error: 'searchReplaceBlocks was an object — use a string with <<<<<<< ORIGINAL markers or write_file with JSON.stringify content',
			blockCount: 0,
		};
	}

	const originalMarkers = (blocks.match(/<<<<<<< ORIGINAL/g) ?? []).length;
	if (originalMarkers === 0) {
		return { ok: false, error: `Missing ${ORIGINAL} marker`, blockCount: 0 };
	}

	let i = 0;
	let blockCount = 0;

	while (i < blocks.length) {
		const origIdx = blocks.indexOf(ORIGINAL, i);
		if (origIdx === -1) {
			break;
		}
		let pos = origIdx + ORIGINAL.length;
		if (blocks[pos] === '\n') {
			pos++;
		} else if (blocks.slice(pos, pos + 2) === '\r\n') {
			pos += 2;
		}

		const divIdx = blocks.indexOf(DIVIDER, pos);
		if (divIdx === -1) {
			return { ok: false, error: `Block ${blockCount + 1}: missing ${DIVIDER}`, blockCount };
		}
		pos = divIdx + DIVIDER.length;
		if (blocks[pos] === '\n') {
			pos++;
		}

		const finalIdx = blocks.indexOf(FINAL, pos);
		if (finalIdx === -1) {
			return { ok: false, error: `Block ${blockCount + 1}: missing ${FINAL}`, blockCount };
		}

		const origText = blocks.slice(origIdx + ORIGINAL.length, divIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
		const finalText = blocks.slice(divIdx + DIVIDER.length, finalIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
		if (!origText.trim()) {
			if ((opts?.allowCreate || opts?.lenient) && finalText.trim()) {
				blockCount++;
				i = finalIdx + FINAL.length;
				continue;
			}
			return { ok: false, error: `Block ${blockCount + 1}: ORIGINAL section is empty`, blockCount };
		}
		if (!finalText.trim()) {
			return { ok: false, error: `Block ${blockCount + 1}: UPDATED section is empty`, blockCount };
		}

		blockCount++;
		i = finalIdx + FINAL.length;
	}

	if (blockCount !== originalMarkers) {
		return {
			ok: false,
			error: `Expected ${originalMarkers} complete block(s), parsed ${blockCount}`,
			blockCount,
		};
	}

	return { ok: true, blockCount };
}
