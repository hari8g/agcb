/*--------------------------------------------------------------------------------------
 *  Agentic AI — symbol / reference impact (LSP + index) for workflow impact phase
 *--------------------------------------------------------------------------------------*/

import type { AgentWorkflowImpact } from './agentWorkflowOrchestration.js';

export type SymbolImpactSource = 'lsp' | 'index';

export interface SymbolImpactReference {
	symbol: string;
	path: string;
	line: number;
	source: SymbolImpactSource;
}

export interface SymbolImpactAnalysis {
	references: SymbolImpactReference[];
	/** Per target file: exported / top-level symbols considered */
	anchorsByFile: { path: string; symbols: string[] }[];
}

export function enrichWorkflowImpactWithSymbols(
	impact: AgentWorkflowImpact,
	analysis: SymbolImpactAnalysis | null | undefined,
): AgentWorkflowImpact {
	if (!analysis?.references.length) {
		return impact;
	}
	const seen = new Set(impact.affectedPaths.map(a => a.path));
	const affectedPaths = [...impact.affectedPaths];
	for (const ref of analysis.references) {
		if (seen.has(ref.path)) {
			continue;
		}
		seen.add(ref.path);
		affectedPaths.push({ path: ref.path, relation: 'symbol' });
		if (affectedPaths.length >= 32) {
			break;
		}
	}
	const symbolSummary = summarizeSymbolImpact(analysis);
	return {
		...impact,
		affectedPaths,
		symbolReferences: analysis.references.slice(0, 24),
		blastRadiusSummary: impact.blastRadiusSummary + (symbolSummary ? ` ${symbolSummary}` : ''),
	};
}

export function summarizeSymbolImpact(analysis: SymbolImpactAnalysis): string {
	if (!analysis.references.length) {
		return '';
	}
	const lspCount = analysis.references.filter(r => r.source === 'lsp').length;
	const files = new Set(analysis.references.map(r => r.path));
	return `Symbol impact: ${analysis.references.length} reference(s) across ${files.size} file(s)${lspCount ? ` (${lspCount} via LSP)` : ''}.`;
}

export function buildSymbolImpactPromptBlock(analysis: SymbolImpactAnalysis | null | undefined): string {
	if (!analysis?.references.length) {
		return '';
	}
	const lines = ['<symbol_impact>', 'Cross-file symbol references (use before refactoring):'];
	for (const anchor of analysis.anchorsByFile.slice(0, 6)) {
		if (anchor.symbols.length) {
			lines.push(`- \`${anchor.path}\`: ${anchor.symbols.slice(0, 8).join(', ')}`);
		}
	}
	const byPath = new Map<string, SymbolImpactReference[]>();
	for (const ref of analysis.references.slice(0, 20)) {
		const list = byPath.get(ref.path) ?? [];
		list.push(ref);
		byPath.set(ref.path, list);
	}
	for (const [p, refs] of byPath) {
		const short = p.split(/[/\\]/).pop() ?? p;
		const items = refs.slice(0, 4).map(r => `${r.symbol}:L${r.line}`).join(', ');
		lines.push(`- \`${short}\` (${refs[0]!.source}): ${items}`);
	}
	lines.push('</symbol_impact>');
	return lines.join('\n');
}

export interface PreflightFileSnippet {
	path: string;
	content: string;
	truncated: boolean;
	error?: string;
}

export function buildPreflightTargetReadsBlock(snippets: PreflightFileSnippet[]): string {
	const ok = snippets.filter(s => s.content && !s.error);
	if (!ok.length) {
		return '';
	}
	const lines = [
		'<preflight_target_reads>',
		'Parallel pre-read of plan targets (do not re-read unless files changed):',
	];
	for (const s of ok) {
		const name = s.path.split(/[/\\]/).pop() ?? s.path;
		lines.push(`\n### ${name}${s.truncated ? ' (truncated)' : ''}\n\`\`\`\n${s.content}\n\`\`\``);
	}
	lines.push('</preflight_target_reads>');
	let text = lines.join('\n');
	if (text.length > 14_000) {
		text = `${text.slice(0, 13_800)}\n…</preflight_target_reads>`;
	}
	return text;
}
