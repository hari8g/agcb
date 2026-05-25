/*--------------------------------------------------------------------------------------
 *  Agentic AI — compact diff preview for Cursor-style edit cards
 *--------------------------------------------------------------------------------------*/

const ORIGINAL = '<<<<<<< ORIGINAL';
const DIVIDER = '=======';
const FINAL = '>>>>>>> UPDATED';

export interface EditDiffLine {
	type: 'add' | 'remove' | 'context';
	text: string;
}

export interface EditDiffSummary {
	added: number;
	removed: number;
	lines: EditDiffLine[];
}

export function summarizeSearchReplaceBlocks(blocks: string, maxLines = 14): EditDiffSummary {
	const lines: EditDiffLine[] = [];
	let added = 0;
	let removed = 0;
	let i = 0;

	while (i < blocks.length && lines.length < maxLines) {
		const origIdx = blocks.indexOf(ORIGINAL, i);
		if (origIdx === -1) {
			break;
		}
		let pos = origIdx + ORIGINAL.length;
		if (blocks[pos] === '\n') {
			pos++;
		}
		const divIdx = blocks.indexOf(DIVIDER, pos);
		if (divIdx === -1) {
			break;
		}
		const origText = blocks.slice(pos, divIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
		pos = divIdx + DIVIDER.length;
		if (blocks[pos] === '\n') {
			pos++;
		}
		const finalIdx = blocks.indexOf(FINAL, pos);
		const finalText = finalIdx === -1
			? blocks.slice(pos)
			: blocks.slice(pos, finalIdx).replace(/^\r?\n/, '').replace(/\r?\n$/, '');

		const origLines = origText.split('\n');
		const finalLines = finalText.split('\n');
		const max = Math.max(origLines.length, finalLines.length);
		for (let j = 0; j < max && lines.length < maxLines; j++) {
			const o = origLines[j];
			const f = finalLines[j];
			if (o === f) {
				if (o !== undefined && o.trim()) {
					lines.push({ type: 'context', text: o });
				}
			} else {
				if (o !== undefined) {
					lines.push({ type: 'remove', text: o });
					removed++;
				}
				if (f !== undefined) {
					lines.push({ type: 'add', text: f });
					added++;
				}
			}
		}
		i = finalIdx === -1 ? blocks.length : finalIdx + FINAL.length;
	}

	return { added, removed, lines };
}
