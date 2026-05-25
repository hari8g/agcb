/*--------------------------------------------------------------------------------------
 *  Agentic AI — context size budgeting (reduce LLM token cost)
 *--------------------------------------------------------------------------------------*/

import type { CodebaseContext } from './contextTypes.js';
import type { TemporalKnowledgeGraph } from './codebaseKnowledgeGraph.js';
import { serializeKnowledgeGraphForPrompt } from './codebaseKnowledgeGraph.js';

export interface ContextBudgetOptions {
	maxContextChars: number;
	compactActiveFile: boolean;
	maxSemanticSnippets: number;
	maxSnippetChars: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudgetOptions = {
	maxContextChars: 14_000,
	compactActiveFile: true,
	maxSemanticSnippets: 6,
	maxSnippetChars: 420,
};

/** Rough char estimate (≈4 chars/token for English/code mix). */
export function estimateCharsAsTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

export function applyContextBudget(
	context: CodebaseContext,
	opts: ContextBudgetOptions,
	knowledgeGraph?: TemporalKnowledgeGraph | null,
): CodebaseContext {
	const next = { ...context, codeGraph: { ...context.codeGraph } };

	next.codeGraph.semanticMatches = next.codeGraph.semanticMatches
		.slice(0, opts.maxSemanticSnippets)
		.map(m => ({
			...m,
			snippet: m.snippet.slice(0, opts.maxSnippetChars),
		}));

	if (opts.compactActiveFile && knowledgeGraph && context.activeFileContent) {
		const hasRelevant = next.codeGraph.semanticMatches.length > 0
			|| knowledgeGraph.queryRelevantPaths.length > 0;
		const large = context.activeFileContent.length > 6000;
		if (hasRelevant && large) {
			const lines = context.activeFileContent.split('\n');
			const preview = lines.slice(0, 48).join('\n');
			next.activeFileContent = [
				`[Compact view — full file omitted to save tokens; use read_file on ${context.activeFilePath}]`,
				preview,
				lines.length > 48 ? `… (${lines.length - 48} more lines)` : '',
			].join('\n').slice(0, 4000);
		}
	}

	if (knowledgeGraph) {
		next.codeGraph.referencedFiles = knowledgeGraph.queryRelevantPaths.map(r => r.path);
		next.codeGraph.knowledgeGraphDigest = serializeKnowledgeGraphForPrompt(
			knowledgeGraph,
			Math.min(2800, opts.maxContextChars * 0.35),
		);
	}

	return next;
}

export function trimTextToBudget(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars - 24)}\n… [truncated]`;
}
