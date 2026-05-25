/*--------------------------------------------------------------------------------------
 *  Agentic AI — end-to-end workflow: Intent → Classify → ContextGraph → Plan → Analyse → Impact → Execute
 *--------------------------------------------------------------------------------------*/

import type { AgentIntentClassification } from './agentIntentClassifier.js';
import { classifyAgentIntent, intentRequiresDeliverableEdits } from './agentIntentClassifier.js';
import type { QueryComplexity, AgentPipelineStrategy } from './agentPipeline.js';
import { classifyQueryComplexity, selectAgentPipelineStrategy } from './agentPipeline.js';
import type { CodebaseContext } from './contextTypes.js';
import type { TemporalKnowledgeGraph } from './codebaseKnowledgeGraph.js';
import { inferFileRole, serializeKnowledgeGraphForPrompt } from './codebaseKnowledgeGraph.js';

/** Ordered phases for pre-execution orchestration and runtime tracking */
export type AgentWorkflowPhase =
	| 'intent_parse'
	| 'classify'
	| 'context_graph'
	| 'plan'
	| 'analyse'
	| 'impact'
	| 'execute'
	| 'verify';

export interface AgentWorkflowPlanStep {
	id: string;
	title: string;
	kind: 'read' | 'search' | 'edit' | 'test' | 'verify';
	targetPaths?: string[];
}

export interface AgentWorkflowPlan {
	goal: string;
	steps: AgentWorkflowPlanStep[];
	constraints: string[];
	risk: 'low' | 'medium' | 'high';
	planOnly: boolean;
}

export interface AgentWorkflowAnalysis {
	summary: string;
	relevantPaths: { path: string; role: string; reason: string }[];
	openQuestions: string[];
	codebaseAreas: string[];
}

export interface AgentWorkflowImpact {
	primaryTargets: string[];
	affectedPaths: { path: string; relation: 'direct' | 'import' | 'semantic' | 'test' | 'neighbor' | 'symbol' }[];
	riskLevel: 'low' | 'medium' | 'high';
	suggestedVerification: string[];
	blastRadiusSummary: string;
	symbolReferences?: { symbol: string; path: string; line: number; source: 'lsp' | 'index' }[];
}

export interface AgentWorkflowSnapshot {
	phases: AgentWorkflowPhase[];
	completedPhases: AgentWorkflowPhase[];
	currentPhase: AgentWorkflowPhase;
	intent: AgentIntentClassification;
	complexity: QueryComplexity;
	plan?: AgentWorkflowPlan;
	analysis?: AgentWorkflowAnalysis;
	impact?: AgentWorkflowImpact;
	updatedAt: number;
}

export interface WorkflowPreflightInput {
	userMessage: string;
	activeFilePath?: string | null;
	planOnlyMode: boolean;
	enableKnowledgeGraph: boolean;
	baseHistoryLimit: number;
	baseSemanticMatches: number;
	profile: 'standard' | 'pro' | 'autonomous';
}

export interface WorkflowPreflightResult {
	snapshot: AgentWorkflowSnapshot;
	pipeline: AgentPipelineStrategy;
	intentSystemBlock: string;
	workflowPromptBlock: string;
}

const PHASE_ORDER: AgentWorkflowPhase[] = [
	'intent_parse',
	'classify',
	'context_graph',
	'plan',
	'analyse',
	'impact',
	'execute',
	'verify',
];

export function workflowPhaseLabel(phase: AgentWorkflowPhase): string {
	switch (phase) {
		case 'intent_parse': return 'Parsing intent';
		case 'classify': return 'Classifying task';
		case 'context_graph': return 'Building context graph';
		case 'plan': return 'Planning approach';
		case 'analyse': return 'Analysing codebase';
		case 'impact': return 'Assessing impact';
		case 'execute': return 'Executing changes';
		case 'verify': return 'Verifying results';
	}
}

export function workflowPhaseLiveTitle(phase: AgentWorkflowPhase): string {
	switch (phase) {
		case 'intent_parse': return 'Intent';
		case 'classify': return 'Classify';
		case 'context_graph': return 'Context graph';
		case 'plan': return 'Plan';
		case 'analyse': return 'Analyse';
		case 'impact': return 'Impact';
		case 'execute': return 'Execute';
		case 'verify': return 'Verify';
	}
}

export function selectWorkflowPhases(opts: {
	intent: AgentIntentClassification;
	complexity: QueryComplexity;
	planOnlyMode: boolean;
}): AgentWorkflowPhase[] {
	const { intent, complexity, planOnlyMode } = opts;

	if (intent.intent === 'general_chat') {
		return ['intent_parse', 'classify', 'context_graph', 'execute'];
	}

	if (intent.intent === 'explain_code' || intent.intent === 'search_codebase') {
		return ['intent_parse', 'classify', 'context_graph', 'analyse', 'execute'];
	}

	if (planOnlyMode || intent.intent === 'plan_task') {
		return ['intent_parse', 'classify', 'context_graph', 'plan', 'analyse', 'impact', 'execute'];
	}

	if (complexity === 'simple') {
		if (intentRequiresDeliverableEdits(intent)) {
			return ['intent_parse', 'classify', 'context_graph', 'execute', 'verify'];
		}
		return ['intent_parse', 'classify', 'context_graph', 'execute'];
	}

	return ['intent_parse', 'classify', 'context_graph', 'plan', 'analyse', 'impact', 'execute', 'verify'];
}

export function runWorkflowPreflight(input: WorkflowPreflightInput): WorkflowPreflightResult {
	const intent = classifyAgentIntent(input.userMessage, {
		activeFilePath: input.activeFilePath ?? null,
	});
	const complexity = classifyQueryComplexity(input.userMessage);
	const pipeline = selectAgentPipelineStrategy(input.userMessage, {
		enableKnowledgeGraph: input.enableKnowledgeGraph,
		baseHistoryLimit: input.baseHistoryLimit,
		baseSemanticMatches: input.baseSemanticMatches,
		profile: input.profile,
	});
	const phases = selectWorkflowPhases({
		intent,
		complexity,
		planOnlyMode: input.planOnlyMode,
	});

	const snapshot: AgentWorkflowSnapshot = {
		phases,
		completedPhases: ['intent_parse', 'classify'],
		currentPhase: 'context_graph',
		intent,
		complexity,
		updatedAt: Date.now(),
	};

	return {
		snapshot,
		pipeline,
		intentSystemBlock: '', // filled after refine in buildWorkflowArtifacts
		workflowPromptBlock: '',
	};
}

export function refineIntentAfterContext(
	userMessage: string,
	context: CodebaseContext,
	prior: AgentIntentClassification,
): AgentIntentClassification {
	const refined = classifyAgentIntent(userMessage, { activeFilePath: context.activeFilePath });
	if (prior.intent === 'general_chat' && refined.intent !== 'general_chat') {
		return refined;
	}
	if (refined.confidence >= prior.confidence) {
		return refined;
	}
	return prior;
}

export function buildWorkflowPlan(
	userMessage: string,
	intent: AgentIntentClassification,
	context: CodebaseContext,
	planOnlyMode: boolean,
): AgentWorkflowPlan {
	const targets = resolveTargetPaths(intent, context);
	const steps: AgentWorkflowPlanStep[] = [];
	let stepId = 1;

	steps.push({
		id: `s${stepId++}`,
		title: 'Map workspace and confirm target paths',
		kind: 'search',
		targetPaths: targets.slice(0, 6),
	});

	if (intent.intent === 'create_file') {
		steps.push({
			id: `s${stepId++}`,
			title: 'Inspect similar files and conventions',
			kind: 'read',
			targetPaths: targets.slice(0, 4),
		});
		steps.push({
			id: `s${stepId++}`,
			title: 'Create or scaffold the new file(s)',
			kind: 'edit',
			targetPaths: targets,
		});
	} else if (intentRequiresDeliverableEdits(intent)) {
		steps.push({
			id: `s${stepId++}`,
			title: 'Read current implementation at targets',
			kind: 'read',
			targetPaths: targets.slice(0, 6),
		});
		steps.push({
			id: `s${stepId++}`,
			title: 'Apply focused edits with write_file or propose_file_edit',
			kind: 'edit',
			targetPaths: targets,
		});
	} else if (intent.intent === 'explain_code' || intent.intent === 'search_codebase') {
		steps.push({
			id: `s${stepId++}`,
			title: 'Gather evidence via read/grep (read-only)',
			kind: 'read',
			targetPaths: targets.slice(0, 8),
		});
	} else {
		steps.push({
			id: `s${stepId++}`,
			title: 'Execute task with appropriate tools',
			kind: 'edit',
			targetPaths: targets,
		});
	}

	if (!planOnlyMode && intentRequiresDeliverableEdits(intent)) {
		steps.push({
			id: `s${stepId++}`,
			title: 'Run tests or lint if applicable',
			kind: 'test',
		});
		steps.push({
			id: `s${stepId++}`,
			title: 'Verify outcome matches user request',
			kind: 'verify',
		});
	}

	const risk: AgentWorkflowPlan['risk'] =
		targets.length > 5 || intent.intent === 'refactor' ? 'high'
			: targets.length > 2 ? 'medium'
				: 'low';

	return {
		goal: summarizeGoal(userMessage, intent),
		steps,
		constraints: buildPlanConstraints(intent, planOnlyMode),
		risk,
		planOnly: planOnlyMode,
	};
}

export function buildWorkflowAnalysis(
	userMessage: string,
	intent: AgentIntentClassification,
	context: CodebaseContext,
	knowledgeGraph: TemporalKnowledgeGraph | null,
): AgentWorkflowAnalysis {
	const relevantPaths: AgentWorkflowAnalysis['relevantPaths'] = [];
	const seen = new Set<string>();

	const addPath = (path: string, reason: string) => {
		if (!path || seen.has(path)) {
			return;
		}
		seen.add(path);
		relevantPaths.push({
			path,
			role: inferFileRole(path),
			reason,
		});
	};

	for (const p of intent.targetPaths) {
		addPath(p, 'mentioned or classified target');
	}
	if (context.activeFilePath) {
		addPath(context.activeFilePath, 'active editor file');
	}
	for (const m of context.codeGraph.semanticMatches.slice(0, 10)) {
		addPath(m.path, `semantic match (score ${m.score.toFixed(2)})`);
	}
	if (knowledgeGraph) {
		for (const r of knowledgeGraph.queryRelevantPaths.slice(0, 8)) {
			addPath(r.path, `architecture graph (${r.hint})`);
		}
	}
	for (const t of context.openTabs.slice(0, 5)) {
		addPath(t.path, t.isActive ? 'active tab' : 'open tab');
	}

	const codebaseAreas = knowledgeGraph?.areas.slice(0, 12)
		?? inferAreasFromPaths(relevantPaths.map(r => r.path));

	const openQuestions = buildOpenQuestions(userMessage, intent, relevantPaths);

	return {
		summary: buildAnalysisSummary(userMessage, intent, relevantPaths, context),
		relevantPaths: relevantPaths.slice(0, 16),
		openQuestions,
		codebaseAreas,
	};
}

export function buildWorkflowImpact(
	intent: AgentIntentClassification,
	context: CodebaseContext,
	knowledgeGraph: TemporalKnowledgeGraph | null,
	analysis: AgentWorkflowAnalysis,
): AgentWorkflowImpact {
	const primaryTargets = resolveTargetPaths(intent, context);
	const affectedPaths: AgentWorkflowImpact['affectedPaths'] = [];
	const seen = new Set<string>();

	const addAffected = (path: string, relation: AgentWorkflowImpact['affectedPaths'][0]['relation']) => {
		if (!path || seen.has(path)) {
			return;
		}
		seen.add(path);
		affectedPaths.push({ path, relation });
	};

	for (const t of primaryTargets) {
		addAffected(t, 'direct');
	}

	if (knowledgeGraph) {
		for (const e of knowledgeGraph.edges) {
			if (e.kind !== 'imports') {
				continue;
			}
			const from = normalizeGraphPath(e.from);
			const to = normalizeGraphPath(e.to);
			if (primaryTargets.some(t => from.includes(t) || t.includes(from))) {
				addAffected(to, 'import');
			}
			if (primaryTargets.some(t => to.includes(t) || t.includes(to))) {
				addAffected(from, 'import');
			}
		}
	}

	for (const r of analysis.relevantPaths) {
		if (/test|spec|__tests__/i.test(r.path)) {
			addAffected(r.path, 'test');
		} else if (!primaryTargets.includes(r.path)) {
			addAffected(r.path, 'semantic');
		}
	}

	for (const t of context.openTabs) {
		if (!seen.has(t.path) && primaryTargets.some(p => sameDirectory(p, t.path))) {
			addAffected(t.path, 'neighbor');
		}
	}

	const riskLevel = computeImpactRisk(primaryTargets, affectedPaths, intent);
	const suggestedVerification = buildVerificationSteps(intent, affectedPaths);

	return {
		primaryTargets,
		affectedPaths: affectedPaths.slice(0, 24),
		riskLevel,
		suggestedVerification,
		blastRadiusSummary: summarizeBlastRadius(primaryTargets, affectedPaths, riskLevel),
	};
}

export function completeWorkflowPhase(
	snapshot: AgentWorkflowSnapshot,
	phase: AgentWorkflowPhase,
): void {
	if (!snapshot.completedPhases.includes(phase)) {
		snapshot.completedPhases.push(phase);
	}
	const idx = PHASE_ORDER.indexOf(phase);
	const next = PHASE_ORDER[idx + 1];
	snapshot.currentPhase = next ?? 'execute';
	snapshot.updatedAt = Date.now();
}

export function buildWorkflowArtifacts(opts: {
	userMessage: string;
	intent: AgentIntentClassification;
	context: CodebaseContext;
	knowledgeGraph: TemporalKnowledgeGraph | null;
	planOnlyMode: boolean;
	snapshot: AgentWorkflowSnapshot;
}): AgentWorkflowSnapshot {
	const { userMessage, intent, context, knowledgeGraph, planOnlyMode, snapshot } = opts;
	const phases = snapshot.phases;

	if (phases.includes('plan')) {
		snapshot.plan = buildWorkflowPlan(userMessage, intent, context, planOnlyMode);
		completeWorkflowPhase(snapshot, 'plan');
	}
	if (phases.includes('analyse')) {
		snapshot.analysis = buildWorkflowAnalysis(userMessage, intent, context, knowledgeGraph);
		completeWorkflowPhase(snapshot, 'analyse');
	}
	if (phases.includes('impact')) {
		snapshot.analysis ??= buildWorkflowAnalysis(userMessage, intent, context, knowledgeGraph);
		snapshot.impact = buildWorkflowImpact(intent, context, knowledgeGraph, snapshot.analysis);
		completeWorkflowPhase(snapshot, 'impact');
	}

	snapshot.currentPhase = 'execute';
	snapshot.updatedAt = Date.now();
	return snapshot;
}

function buildSimpleWorkflowOrchestrationBlock(snapshot: AgentWorkflowSnapshot): string {
	const { intent } = snapshot.intent;
	const lines = [
		'<workflow_orchestration>',
		`mode: fast | intent: ${intent} | complexity: simple`,
	];
	if (intent === 'create_file') {
		lines.push(
			'Execute immediately: create requested files with `write_file` (full contents).',
			'At most one `read_file` if a path is ambiguous. No multi-step plan — ship the files, then one short summary.',
		);
	} else {
		lines.push('Use tools directly with minimal reads. Brief summary when done.');
	}
	if (snapshot.plan?.steps.length) {
		lines.push('', 'Focus:');
		for (const step of snapshot.plan.steps.slice(0, 5)) {
			lines.push(`- ${step.title}`);
		}
	}
	lines.push('</workflow_orchestration>');
	return lines.join('\n');
}

export function buildWorkflowOrchestrationPromptBlock(snapshot: AgentWorkflowSnapshot): string {
	if (snapshot.complexity === 'simple') {
		return buildSimpleWorkflowOrchestrationBlock(snapshot);
	}
	const parts: string[] = ['<workflow_orchestration>'];
	parts.push(`pipeline: ${snapshot.phases.join(' → ')}`);
	parts.push(`complexity: ${snapshot.complexity}`);
	parts.push(`intent: ${snapshot.intent.intent} (${(snapshot.intent.confidence * 100).toFixed(0)}%)`);

	if (snapshot.plan) {
		parts.push('', '## Execution plan (follow in order)');
		parts.push(`Goal: ${snapshot.plan.goal}`);
		parts.push(`Risk: ${snapshot.plan.risk}${snapshot.plan.planOnly ? ' — PLAN ONLY until user approves' : ''}`);
		if (snapshot.plan.constraints.length) {
			parts.push('Constraints:');
			for (const c of snapshot.plan.constraints) {
				parts.push(`- ${c}`);
			}
		}
		for (const step of snapshot.plan.steps) {
			const paths = step.targetPaths?.length ? ` [${step.targetPaths.map(p => p.split(/[/\\]/).pop()).join(', ')}]` : '';
			parts.push(`${step.id}. (${step.kind}) ${step.title}${paths}`);
		}
	}

	if (snapshot.analysis) {
		parts.push('', '## Codebase analysis');
		parts.push(snapshot.analysis.summary);
		if (snapshot.analysis.relevantPaths.length) {
			parts.push('', 'Relevant files:');
			for (const r of snapshot.analysis.relevantPaths.slice(0, 12)) {
				parts.push(`- \`${r.path}\` (${r.role}): ${r.reason}`);
			}
		}
		if (snapshot.analysis.openQuestions.length) {
			parts.push('', 'Resolve before finishing:');
			for (const q of snapshot.analysis.openQuestions) {
				parts.push(`- ${q}`);
			}
		}
	}

	if (snapshot.impact) {
		parts.push('', '## Impact assessment');
		parts.push(snapshot.impact.blastRadiusSummary);
		parts.push(`Risk level: ${snapshot.impact.riskLevel}`);
		if (snapshot.impact.primaryTargets.length) {
			parts.push(`Primary targets: ${snapshot.impact.primaryTargets.join(', ')}`);
		}
		if (snapshot.impact.affectedPaths.length) {
			parts.push('', 'Affected / related paths:');
			for (const a of snapshot.impact.affectedPaths.slice(0, 14)) {
				parts.push(`- \`${a.path}\` (${a.relation})`);
			}
		}
		if (snapshot.impact.suggestedVerification.length) {
			parts.push('', 'Verification:');
			for (const v of snapshot.impact.suggestedVerification) {
				parts.push(`- ${v}`);
			}
		}
		if (snapshot.impact.symbolReferences?.length) {
			parts.push('', 'Symbol references (LSP/index):');
			for (const ref of snapshot.impact.symbolReferences.slice(0, 12)) {
				const short = ref.path.split(/[/\\]/).pop() ?? ref.path;
				parts.push(`- \`${ref.symbol}\` → ${short}:${ref.line} (${ref.source})`);
			}
		}
	}

	parts.push(
		'',
		'Execute this workflow: respect the plan order, use tools on listed paths, and run verification when risk is medium or high.',
		'</workflow_orchestration>',
	);

	let text = parts.join('\n');
	if (text.length > 5200) {
		text = `${text.slice(0, 5180)}\n…</workflow_orchestration>`;
	}
	return text;
}

// --- helpers ---

function resolveTargetPaths(intent: AgentIntentClassification, context: CodebaseContext): string[] {
	const paths = [...intent.targetPaths];
	if (context.activeFilePath && !paths.includes(context.activeFilePath)) {
		paths.unshift(context.activeFilePath);
	}
	return paths.slice(0, 12);
}

function summarizeGoal(userMessage: string, intent: AgentIntentClassification): string {
	const short = userMessage.replace(/\s+/g, ' ').trim().slice(0, 200);
	return `${intent.intent.replace(/_/g, ' ')}: ${short}`;
}

function buildPlanConstraints(intent: AgentIntentClassification, planOnlyMode: boolean): string[] {
	const c: string[] = [];
	if (planOnlyMode) {
		c.push('Do not apply edits until the user approves this plan.');
	}
	if (intent.intent === 'explain_code') {
		c.push('Read-only — no propose_file_edit unless user asks to change code.');
	}
	if (intent.intent === 'create_file') {
		c.push('Prefer creating minimal viable files; match project conventions.');
	}
	c.push('Use searchReplaceBlocks with verbatim ORIGINAL text from read_file.');
	return c;
}

function buildAnalysisSummary(
	userMessage: string,
	intent: AgentIntentClassification,
	paths: AgentWorkflowAnalysis['relevantPaths'],
	context: CodebaseContext,
): string {
	const top = paths.slice(0, 4).map(p => p.path.split(/[/\\]/).pop()).filter(Boolean).join(', ');
	const ws = context.workspaceFolderUris.length
		? `${context.workspaceFolderUris.length} workspace folder(s)`
		: 'workspace';
	return `Task "${userMessage.slice(0, 80)}${userMessage.length > 80 ? '…' : ''}" in ${ws}. `
		+ `Classified as ${intent.intent.replace(/_/g, ' ')}. `
		+ (top ? `Start with: ${top}. ` : '')
		+ `${paths.length} relevant path(s) identified from graph, semantics, and editor state.`;
}

function buildOpenQuestions(
	userMessage: string,
	intent: AgentIntentClassification,
	paths: AgentWorkflowAnalysis['relevantPaths'],
): string[] {
	const q: string[] = [];
	if (intentRequiresDeliverableEdits(intent) && !paths.length) {
		q.push('Which file(s) should be changed? Use list_workspace if targets are unclear.');
	}
	if (/package\.json/i.test(userMessage) && !paths.some(p => /package\.json$/i.test(p.path))) {
		q.push('Confirm package.json location (repo root vs subpackage).');
	}
	if (intent.intent === 'refactor' && paths.length > 8) {
		q.push('Scope is large — confirm whether to refactor incrementally or in one pass.');
	}
	return q.slice(0, 4);
}

function inferAreasFromPaths(paths: string[]): string[] {
	const areas = new Set<string>();
	for (const p of paths) {
		const parts = p.split(/[/\\]/).filter(Boolean);
		if (parts.length >= 2) {
			areas.add(`${parts[0]}/${parts[1]}/`);
		} else if (parts[0]) {
			areas.add(`${parts[0]}/`);
		}
	}
	return [...areas].slice(0, 10);
}

function normalizeGraphPath(p: string): string {
	return p.replace(/^file:/, '').replace(/^pkg:/, '');
}

function sameDirectory(a: string, b: string): boolean {
	const da = a.split(/[/\\]/).slice(0, -1).join('/');
	const db = b.split(/[/\\]/).slice(0, -1).join('/');
	return da.length > 0 && da === db;
}

function computeImpactRisk(
	primary: string[],
	affected: AgentWorkflowImpact['affectedPaths'],
	intent: AgentIntentClassification,
): AgentWorkflowImpact['riskLevel'] {
	if (intent.intent === 'refactor' || primary.length > 5 || affected.length > 12) {
		return 'high';
	}
	if (primary.length > 2 || affected.length > 5) {
		return 'medium';
	}
	return 'low';
}

function buildVerificationSteps(
	intent: AgentIntentClassification,
	affected: AgentWorkflowImpact['affectedPaths'],
): string[] {
	const steps: string[] = [];
	const tests = affected.filter(a => a.relation === 'test').map(a => a.path);
	if (tests.length) {
		steps.push(`Run tests touching: ${tests.slice(0, 3).map(p => p.split(/[/\\]/).pop()).join(', ')}`);
	}
	if (intentRequiresDeliverableEdits(intent)) {
		steps.push('Re-read edited files to confirm changes applied');
	}
	if (intent.intent === 'create_file') {
		steps.push('Confirm new file exists and imports resolve');
	}
	if (!steps.length) {
		steps.push('Sanity-check tool results match the user request');
	}
	return steps;
}

function summarizeBlastRadius(
	primary: string[],
	affected: AgentWorkflowImpact['affectedPaths'],
	risk: AgentWorkflowImpact['riskLevel'],
): string {
	return `${primary.length} primary target(s), ${affected.length} related path(s) — ${risk} blast radius. `
		+ (risk === 'high'
			? 'Prefer small incremental edits and verify after each change.'
			: risk === 'medium'
				? 'Review neighbors and tests before completing.'
				: 'Localized change expected.');
}

/** Re-export for context injection when only graph is needed */
export { serializeKnowledgeGraphForPrompt };
