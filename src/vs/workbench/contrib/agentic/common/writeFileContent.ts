/*--------------------------------------------------------------------------------------
 *  Agentic AI — coerce write_file content (models often emit JSON objects)
 *--------------------------------------------------------------------------------------*/

/** Prevent String({}) → "[object Object]" when applying write_file. */
export function coerceWriteFileContent(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2) + '\n';
		} catch {
			return String(value);
		}
	}
	return String(value);
}

/** Coerce propose_file_edit blocks (models often emit JSON objects). */
export function coerceSearchReplaceBlocks(value: unknown): string {
	return coerceWriteFileContent(value);
}

export function normalizeWriteToolArguments(args: Record<string, unknown>): Record<string, unknown> {
	if (!args || typeof args !== 'object') {
		return args;
	}
	const out = { ...args };
	if ('content' in out) {
		out.content = coerceWriteFileContent(out.content);
	}
	if ('searchReplaceBlocks' in out) {
		out.searchReplaceBlocks = coerceSearchReplaceBlocks(out.searchReplaceBlocks);
	}
	if (typeof out.newContent === 'object' && out.newContent !== null) {
		out.newContent = coerceWriteFileContent(out.newContent);
	}
	if (typeof out.code === 'object' && out.code !== null) {
		out.code = coerceWriteFileContent(out.code);
	}
	if (typeof out.diff === 'object' && out.diff !== null) {
		out.diff = coerceSearchReplaceBlocks(out.diff);
	}
	return out;
}
