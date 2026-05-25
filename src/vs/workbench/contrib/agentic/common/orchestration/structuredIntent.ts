/*--------------------------------------------------------------------------------------
 *  Agentic AI — structured intent classifier (canonical output)
 *--------------------------------------------------------------------------------------*/

import { classifyAgentIntent, type AgentIntent } from '../agentIntentClassifier.js';
import { classifyQueryComplexity, type QueryComplexity } from '../agentPipeline.js';

export type StructuredIntentKind =
	| 'answer_question'
	| 'create_file'
	| 'edit_file'
	| 'fix_bug'
	| 'refactor'
	| 'add_feature'
	| 'write_tests'
	| 'run_command'
	| 'jira_workflow'
	| 'unknown';

export type IntentScope = 'file' | 'module' | 'repo' | 'chat';
export type IntentRisk = 'low' | 'medium' | 'high';

export interface StructuredIntent {
	intent: StructuredIntentKind;
	confidence: number;
	complexity: QueryComplexity;
	scope: IntentScope;
	risk: IntentRisk;
	explicitPaths: string[];
	implicitGoals: string[];
	needsContextGraph: boolean;
	needsApproval: boolean;
	/** Legacy intent for adapters */
	legacyIntent: AgentIntent;
	requiresEdits: boolean;
	requiresTools: boolean;
	signals: string[];
}

const REPO_SCOPE_RE = /\b(codebase|repository|monorepo|entire project|across|multiple files|service layer)\b/i;
const MODULE_SCOPE_RE = /\b(module|feature|component|api|endpoint|package)\b/i;

function mapLegacyIntent(legacy: AgentIntent): StructuredIntentKind {
	switch (legacy) {
		case 'explain_code':
		case 'search_codebase':
		case 'general_chat':
		case 'review_code':
			return 'answer_question';
		case 'create_file':
			return 'create_file';
		case 'edit_file':
		case 'improve_code':
		case 'execute_plan':
			return legacy === 'improve_code' ? 'add_feature' : 'edit_file';
		case 'fix_bug':
			return 'fix_bug';
		case 'refactor':
			return 'refactor';
		case 'write_tests':
			return 'write_tests';
		case 'run_terminal':
			return 'run_command';
		case 'jira_workflow':
			return 'jira_workflow';
		case 'plan_task':
			return 'unknown';
		default:
			return 'unknown';
	}
}

function inferScope(text: string, paths: string[], complexity: QueryComplexity): IntentScope {
	if (/^(thanks|ok|hello|hi)\b/i.test(text.trim())) {
		return 'chat';
	}
	if (REPO_SCOPE_RE.test(text)) {
		return 'repo';
	}
	if (complexity === 'complex' && REPO_SCOPE_RE.test(text)) {
		return 'repo';
	}
	if (MODULE_SCOPE_RE.test(text) || paths.length > 2) {
		return 'module';
	}
	if (paths.length > 0) {
		return 'file';
	}
	return 'module';
}

function inferRisk(kind: StructuredIntentKind, scope: IntentScope, complexity: QueryComplexity): IntentRisk {
	if (kind === 'run_command' || kind === 'refactor' && scope === 'repo') {
		return 'high';
	}
	if (complexity === 'complex' || scope === 'repo') {
		return 'medium';
	}
	if (kind === 'create_file' || kind === 'edit_file' || kind === 'fix_bug') {
		return 'low';
	}
	return 'low';
}

function inferImplicitGoals(text: string, kind: StructuredIntentKind): string[] {
	const goals: string[] = [];
	if (kind === 'create_file') {
		goals.push('Deliver new file(s) with valid content');
	}
	if (kind === 'fix_bug') {
		goals.push('Identify root cause and apply minimal fix');
	}
	if (kind === 'write_tests') {
		goals.push('Add or update tests for target behavior');
	}
	if (/\bpackage\.json\b/i.test(text)) {
		goals.push('Configure package metadata');
	}
	if (/\b(test|lint|build)\b/i.test(text)) {
		goals.push('Verify with tests or lint when applicable');
	}
	return goals;
}

export function classifyStructuredIntent(
	userMessage: string,
	opts?: { activeFilePath?: string | null; planOnlyMode?: boolean },
): StructuredIntent {
	const legacy = classifyAgentIntent(userMessage, { activeFilePath: opts?.activeFilePath ?? null });
	const complexity = classifyQueryComplexity(userMessage);
	const intent = mapLegacyIntent(legacy.intent);
	const explicitPaths = legacy.targetPaths;
	const scope = inferScope(userMessage, explicitPaths, complexity);
	const risk = inferRisk(intent, scope, complexity);
	const needsContextGraph = complexity === 'complex' || scope === 'repo';
	const needsApproval =
		opts?.planOnlyMode === true
		|| legacy.intent === 'plan_task'
		|| (legacy.intent === 'refactor'
			&& complexity === 'complex'
			&& REPO_SCOPE_RE.test(userMessage));

	return {
		intent,
		confidence: legacy.confidence,
		complexity,
		scope,
		risk,
		explicitPaths,
		implicitGoals: inferImplicitGoals(userMessage, intent),
		needsContextGraph,
		needsApproval,
		legacyIntent: legacy.intent,
		requiresEdits: legacy.requiresEdits,
		requiresTools: legacy.requiresTools,
		signals: legacy.signals,
	};
}

export function buildStructuredIntentPromptBlock(si: StructuredIntent): string {
	return [
		'<structured_intent>',
		`intent: ${si.intent}`,
		`confidence: ${(si.confidence * 100).toFixed(0)}%`,
		`complexity: ${si.complexity}`,
		`scope: ${si.scope}`,
		`risk: ${si.risk}`,
		si.explicitPaths.length ? `explicit_paths: ${si.explicitPaths.join(', ')}` : '',
		si.implicitGoals.length ? `goals: ${si.implicitGoals.join('; ')}` : '',
		`needs_context_graph: ${si.needsContextGraph}`,
		`needs_approval: ${si.needsApproval}`,
		'</structured_intent>',
	].filter(Boolean).join('\n');
}
