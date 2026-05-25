/*--------------------------------------------------------------------------------------
 *  Agentic AI — post-edit lint verify (Void marker integration)
 *--------------------------------------------------------------------------------------*/

export interface LintErrorSummary {
	path: string;
	startLineNumber: number;
	endLineNumber: number;
	message: string;
}

export function parseLintToolResult(content: string): LintErrorSummary[] {
	if (!content || /no lint errors found/i.test(content)) {
		return [];
	}
	const errors: LintErrorSummary[] = [];
	const blocks = content.split(/Error \d+:/).filter(b => b.trim());
	for (const block of blocks) {
		const linesMatch = block.match(/Lines Affected:\s*(\d+)-(\d+)/i);
		const msgMatch = block.match(/Error message:\s*([\s\S]+?)(?=\n\nError |\n*$)/i);
		if (!linesMatch || !msgMatch) {
			continue;
		}
		errors.push({
			path: '',
			startLineNumber: Number.parseInt(linesMatch[1], 10),
			endLineNumber: Number.parseInt(linesMatch[2], 10),
			message: msgMatch[1].trim(),
		});
	}
	return errors;
}

export function hasLintErrors(lintResult: string): boolean {
	return parseLintToolResult(lintResult).length > 0
		|| (/error/i.test(lintResult) && !/no lint errors/i.test(lintResult) && lintResult.includes('Lines Affected'));
}

export function buildPostEditLintNudge(filePath: string, lintResult: string): string {
	const lines = [
		'[Orchestrator — post-edit lint]',
		`After applying edits to "${filePath}", the workspace reported diagnostics:`,
		'',
		lintResult.slice(0, 3000),
		'',
		'Fix these issues: read the file, then use write_file or propose_file_edit (or read_lint_errors to confirm). Do not claim the task is done until lint is clean or you explain remaining issues.',
	];
	return lines.join('\n');
}

export function appendLintToToolPreview(preview: string, lintResult: string | undefined): string {
	if (!lintResult || !hasLintErrors(lintResult)) {
		return preview;
	}
	const snippet = lintResult.slice(0, 800);
	return `${preview}\n\n--- Lint (post-apply) ---\n${snippet}`;
}
