/*--------------------------------------------------------------------------------------
 *  Agentic AI — query classification and context budget strategy
 *  Full pipeline phases (Intent→Plan→Analyse→Impact→Execute): agentWorkflowOrchestration.ts
 *--------------------------------------------------------------------------------------*/

import type { ContextBudgetOptions } from './contextBudget.js';
import { DEFAULT_CONTEXT_BUDGET } from './contextBudget.js';
import { classifyAgentIntent } from './agentIntentClassifier.js';

export type AgentPipelinePhase = 'understand' | 'plan' | 'execute' | 'verify';

export type QueryComplexity = 'simple' | 'complex';

export interface AgentPipelineStrategy {
	complexity: QueryComplexity;
	phases: AgentPipelinePhase[];
	/** Build / refresh temporal knowledge graph before LLM */
	preflightKnowledgeGraph: boolean;
	contextBudget: ContextBudgetOptions;
	/** Shorter history for complex runs */
	historyMessageLimit?: number;
	maxSemanticMatches: number;
}

const COMPLEX_HINTS = /\b(refactor|architect|migrate|codebase|repository|monorepo|workflow|orchestrat|integrat|module|service layer|end[- ]to[- ]end|across|multiple files|entire project)\b/i;

/** Scaffold / greenfield — stay on fast path even for longer prompts */
const SCAFFOLD_SIMPLE_HINTS =
	/\b(create|build|make|scaffold|bootstrap|init|set\s+up|generate)\b[\s\S]{0,200}\b(app|application|project|package\.json|react|vite|express|api|server|website|site|todo|starter)\b/i;

export function classifyQueryComplexity(userMessage: string): QueryComplexity {
	const intent = classifyAgentIntent(userMessage);
	if (intent.intent === 'general_chat' || intent.intent === 'explain_code') {
		return 'simple';
	}
	const t = userMessage.trim();
	if (SCAFFOLD_SIMPLE_HINTS.test(t) && !COMPLEX_HINTS.test(t) && t.length < 800) {
		return 'simple';
	}
	if (intent.intent === 'create_file' && !COMPLEX_HINTS.test(t) && t.length < 600) {
		return 'simple';
	}
	if (t.length < 100 && !COMPLEX_HINTS.test(t)) {
		return 'simple';
	}
	if (t.length > 320 || COMPLEX_HINTS.test(t) || intent.intent === 'refactor' || intent.intent === 'execute_plan') {
		return 'complex';
	}
	return 'simple';
}

export function selectAgentPipelineStrategy(
	userMessage: string,
	opts: {
		enableKnowledgeGraph: boolean;
		baseHistoryLimit: number;
		baseSemanticMatches: number;
		profile: 'standard' | 'pro' | 'autonomous';
	},
): AgentPipelineStrategy {
	const complexity = classifyQueryComplexity(userMessage);
	const preflight = opts.enableKnowledgeGraph && complexity === 'complex';

	if (complexity === 'complex') {
		return {
			complexity,
			phases: ['understand', 'plan', 'execute', 'verify'],
			preflightKnowledgeGraph: preflight,
			contextBudget: {
				...DEFAULT_CONTEXT_BUDGET,
				maxContextChars: opts.profile === 'autonomous' ? 18_000 : 14_000,
				maxSemanticSnippets: Math.min(opts.baseSemanticMatches, 8),
			},
			historyMessageLimit: Math.min(opts.baseHistoryLimit, opts.profile === 'standard' ? 24 : 36),
			maxSemanticMatches: Math.min(opts.baseSemanticMatches, 10),
		};
	}

	return {
		complexity,
		phases: ['execute', 'verify'],
		/** Simple queries use cached graph only — avoid blocking chat on a full repo scan */
		preflightKnowledgeGraph: false,
		contextBudget: {
			...DEFAULT_CONTEXT_BUDGET,
			maxContextChars: 12_000,
			maxSemanticSnippets: opts.baseSemanticMatches,
		},
		historyMessageLimit: opts.baseHistoryLimit,
		maxSemanticMatches: opts.baseSemanticMatches,
	};
}

export function pipelinePhaseLabel(phase: AgentPipelinePhase): string {
	switch (phase) {
		case 'understand': return 'Understanding codebase architecture';
		case 'plan': return 'Planning approach';
		case 'execute': return 'Executing changes';
		case 'verify': return 'Verifying results';
	}
}
