/*--------------------------------------------------------------------------------------
 *  Agentic AI — context collection strategy (simple vs complex)
 *--------------------------------------------------------------------------------------*/

import type { StructuredIntent } from './structuredIntent.js';

export interface ContextCollectionPlan {
	tier: 'simple' | 'complex';
	includeActiveFile: boolean;
	includeSelection: boolean;
	includeMentionedFiles: boolean;
	includeOpenTabs: boolean;
	includeRecentFiles: boolean;
	includeSemanticSearch: boolean;
	includeImportGraph: boolean;
	includeRelatedTests: boolean;
	includePackageConfig: boolean;
	includeProjectRules: boolean;
	includeSymbolReferences: boolean;
	semanticSearchLimit: number;
	maxContextChars: number;
}

export function buildContextCollectionPlan(
	intent: StructuredIntent,
	opts: {
		includeActiveFile: boolean;
		includeSelection: boolean;
		baseSemanticLimit: number;
		maxContextChars: number;
		useWorkspaceRules: boolean;
	},
): ContextCollectionPlan {
	const simple = intent.complexity === 'simple' && intent.scope !== 'repo';

	if (simple) {
		return {
			tier: 'simple',
			includeActiveFile: opts.includeActiveFile,
			includeSelection: opts.includeSelection,
			includeMentionedFiles: true,
			includeOpenTabs: false,
			includeRecentFiles: false,
			includeSemanticSearch: intent.intent !== 'answer_question',
			includeImportGraph: false,
			includeRelatedTests: false,
			includePackageConfig: intent.explicitPaths.some(p => /package\.json/i.test(p)),
			includeProjectRules: opts.useWorkspaceRules,
			includeSymbolReferences: false,
			semanticSearchLimit: Math.min(opts.baseSemanticLimit, 8),
			maxContextChars: Math.min(opts.maxContextChars, 12_000),
		};
	}

	return {
		tier: 'complex',
		includeActiveFile: opts.includeActiveFile,
		includeSelection: opts.includeSelection,
		includeMentionedFiles: true,
		includeOpenTabs: true,
		includeRecentFiles: true,
		includeSemanticSearch: true,
		includeImportGraph: intent.needsContextGraph,
		includeRelatedTests: intent.requiresEdits || intent.intent === 'write_tests',
		includePackageConfig: true,
		includeProjectRules: opts.useWorkspaceRules,
		includeSymbolReferences: intent.scope !== 'chat',
		semanticSearchLimit: opts.baseSemanticLimit,
		maxContextChars: opts.maxContextChars,
	};
}

export function buildContextStrategyPromptBlock(plan: ContextCollectionPlan): string {
	return [
		'<context_strategy>',
		`tier: ${plan.tier}`,
		`semantic_limit: ${plan.semanticSearchLimit}`,
		plan.includeRelatedTests ? '- Include related test files when editing' : '',
		plan.includeImportGraph ? '- Use knowledge graph / import neighbors for impact' : '',
		plan.includePackageConfig ? '- Consider package.json / lockfiles for verify commands' : '',
		'</context_strategy>',
	].filter(Boolean).join('\n');
}

/** Heuristic test file paths related to a source path */
export function relatedTestPathHints(sourcePath: string): string[] {
	const base = sourcePath.replace(/\\/g, '/');
	const file = base.split('/').pop() ?? base;
	const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '';
	const stem = file.replace(/\.(tsx?|jsx?|py|go|rs)$/, '');
	const hints: string[] = [];
	if (/\.tsx?$/.test(file)) {
		hints.push(`${dir}/__tests__/${stem}.test.ts`, `${dir}/${stem}.test.ts`, `${dir}/${stem}.spec.ts`);
	}
	if (/\.py$/.test(file)) {
		hints.push(`${dir}/test_${stem}.py`, `${dir}/tests/test_${stem}.py`);
	}
	return hints;
}
