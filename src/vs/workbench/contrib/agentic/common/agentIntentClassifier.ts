/*--------------------------------------------------------------------------------------
 *  Agentic AI — high-precision developer intent classification for routing
 *--------------------------------------------------------------------------------------*/

export type AgentIntent =
	| 'edit_file'
	| 'improve_code'
	| 'create_file'
	| 'fix_bug'
	| 'refactor'
	| 'explain_code'
	| 'review_code'
	| 'write_tests'
	| 'run_terminal'
	| 'search_codebase'
	| 'plan_task'
	| 'execute_plan'
	| 'jira_workflow'
	| 'general_chat';

export interface AgentIntentClassification {
	intent: AgentIntent;
	/** 0–1 calibrated score for the primary intent */
	confidence: number;
	secondary: AgentIntent[];
	requiresEdits: boolean;
	requiresTools: boolean;
	targetPaths: string[];
	suggestedSkill?: '/plan' | '/review' | '/test' | '/fix' | '/refactor' | '/explain';
	signals: string[];
}

type IntentScore = { intent: AgentIntent; score: number; signal: string };

const FILE_PATH_RE = /@?([\w./\\-]+\.(?:py|ts|tsx|js|jsx|vue|go|rs|java|kt|cs|rb|php|sql|md|json|ya?ml|css|html))\b/gi;
const DIR_PATH_RE = /@?((?:[\w.-]+[/\\])+[\w.-]+)\b/g;

const INTENT_RULES: { intent: AgentIntent; weight: number; re: RegExp; signal: string }[] = [
	{ intent: 'execute_plan', weight: 1.0, re: /\[Execute approved plan\]/i, signal: 'execute_plan_marker' },
	{ intent: 'jira_workflow', weight: 0.95, re: /\b(jira|jira-|ticket\s+[A-Z]{2,}-\d+|sprint|backlog|atlassian)\b/i, signal: 'jira_keywords' },
	{ intent: 'plan_task', weight: 0.92, re: /^\s*\/plan\b|^\[Plan mode\]/i, signal: 'plan_skill' },
	{ intent: 'review_code', weight: 0.9, re: /^\s*\/review\b|^\[Code review\]/i, signal: 'review_skill' },
	{ intent: 'write_tests', weight: 0.9, re: /^\s*\/test\b|^\[Test mode\]/i, signal: 'test_skill' },
	{ intent: 'fix_bug', weight: 0.9, re: /^\s*\/fix\b|^\[Fix mode\]|fix\s+(?:the\s+)?(?:this\s+)?(bug|error|issue|crash)|\bfix\b[\s\S]{0,40}\b(crash|bug|error|issue)\b|debug\b/i, signal: 'fix_skill' },
	{ intent: 'refactor', weight: 0.88, re: /^\s*\/refactor\b|^\[Refactor mode\]|refactor\b/i, signal: 'refactor_skill' },
	{ intent: 'explain_code', weight: 0.88, re: /^\s*\/explain\b|^\[Explain mode\]|^(what|how|why)\s+(does|is|do)\b|explain\b(?!.*\b(implement|add|fix))\b/i, signal: 'explain_skill' },
	{ intent: 'run_terminal', weight: 0.85, re: /\b(run|execute|npm |yarn |pnpm |pytest|cargo test|make test|docker compose)\b/i, signal: 'terminal' },
	{ intent: 'create_file', weight: 0.94, re: /\b(create|build|make|scaffold|bootstrap|init)\s+(a\s+)?(simple\s+)?(app|application|project|website|site|api|server)\b/i, signal: 'create_app' },
	{ intent: 'create_file', weight: 0.9, re: /\b(package\.json|npm init|vite|create-react-app|create-vite)\b/i, signal: 'scaffold_tooling' },
	{ intent: 'create_file', weight: 0.88, re: /\b(create|add|scaffold|generate|new)\s+(a\s+)?(file|module|class|component|endpoint|api|route)\b/i, signal: 'create' },
	{ intent: 'improve_code', weight: 0.9, re: /\b(improve|enhance|optimize|polish|clean\s+up|modernize|strengthen|better)\b/i, signal: 'improve' },
	{ intent: 'fix_bug', weight: 0.82, re: /\b(broken|failing|doesn't work|not working|regression|exception|stack trace)\b/i, signal: 'broken' },
	{ intent: 'edit_file', weight: 0.8, re: /\b(update|modify|change|edit|patch|implement|apply|wire|integrate)\b/i, signal: 'edit_verbs' },
	{ intent: 'review_code', weight: 0.75, re: /\b(review|audit|check)\s+(this|the|my)?\s*(code|pr|pull request)\b/i, signal: 'review' },
	{ intent: 'write_tests', weight: 0.78, re: /\b(test coverage|unit test|integration test|add tests)\b/i, signal: 'tests' },
	{ intent: 'search_codebase', weight: 0.7, re: /\b(find|search|where is|locate|grep|look for|show me)\b/i, signal: 'search' },
	{ intent: 'refactor', weight: 0.72, re: /\b(restructure|reorganize|extract|split|rename)\b/i, signal: 'refactor_verbs' },
	{ intent: 'plan_task', weight: 0.65, re: /\b(plan|outline|steps|approach|strategy)\b(?!.*execute)/i, signal: 'plan_words' },
];

const CHAT_ONLY_RE = /^(thanks|thank you|ok|okay|yes|no|hi|hello|hey|cool|great)\b[!.?\s]*$/i;

const EDIT_INTENTS = new Set<AgentIntent>([
	'edit_file', 'improve_code', 'create_file', 'fix_bug', 'refactor', 'execute_plan', 'write_tests',
]);

const TOOL_INTENTS = new Set<AgentIntent>([
	...EDIT_INTENTS,
	'search_codebase', 'run_terminal', 'review_code', 'jira_workflow',
]);

function extractTargetPaths(text: string): string[] {
	const paths = new Set<string>();
	let m: RegExpExecArray | null;
	FILE_PATH_RE.lastIndex = 0;
	while ((m = FILE_PATH_RE.exec(text)) !== null) {
		const p = m[1].replace(/^@/, '');
		if (p.length > 2) {
			paths.add(p);
		}
	}
	DIR_PATH_RE.lastIndex = 0;
	while ((m = DIR_PATH_RE.exec(text)) !== null) {
		const p = m[1].replace(/^@/, '');
		if (p.includes('/') || p.includes('\\')) {
			paths.add(p);
		}
	}
	return [...paths];
}

function skillForIntent(intent: AgentIntent): AgentIntentClassification['suggestedSkill'] {
	switch (intent) {
		case 'plan_task': return '/plan';
		case 'review_code': return '/review';
		case 'write_tests': return '/test';
		case 'fix_bug': return '/fix';
		case 'refactor': return '/refactor';
		case 'explain_code': return '/explain';
		default: return undefined;
	}
}

/** Classify developer query for orchestration, UI, and completion checks. */
export function classifyAgentIntent(
	userMessage: string,
	ctx?: { activeFilePath?: string | null; awaitingJiraDecision?: boolean },
): AgentIntentClassification {
	const text = userMessage.trim();
	const signals: string[] = [];
	const scores = new Map<AgentIntent, number>();

	if (!text || text.length < 2) {
		return {
			intent: 'general_chat',
			confidence: 0.5,
			secondary: [],
			requiresEdits: false,
			requiresTools: false,
			targetPaths: [],
			signals: ['empty'],
		};
	}

	if (CHAT_ONLY_RE.test(text)) {
		return {
			intent: 'general_chat',
			confidence: 0.99,
			secondary: [],
			requiresEdits: false,
			requiresTools: false,
			targetPaths: [],
			signals: ['chat_only'],
		};
	}

	if (ctx?.awaitingJiraDecision && /^(yes|y|proceed|go|run|ok|okay)$/i.test(text)) {
		return {
			intent: 'jira_workflow',
			confidence: 0.99,
			secondary: [],
			requiresEdits: true,
			requiresTools: true,
			targetPaths: extractTargetPaths(text),
			signals: ['jira_proceed'],
		};
	}

	const paths = extractTargetPaths(text);
	if (ctx?.activeFilePath && !paths.length) {
		paths.push(ctx.activeFilePath);
		signals.push('active_file');
	}
	if (paths.length) {
		signals.push(`paths:${paths.length}`);
		for (const intent of ['edit_file', 'improve_code'] as AgentIntent[]) {
			scores.set(intent, (scores.get(intent) ?? 0) + 0.35);
		}
	}

	const hits: IntentScore[] = [];
	for (const rule of INTENT_RULES) {
		if (rule.re.test(text)) {
			hits.push({ intent: rule.intent, score: rule.weight, signal: rule.signal });
			scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
		}
	}

	// @file without action verbs → improve/edit
	if (/@/.test(text) && !scores.size) {
		scores.set('improve_code', 0.75);
		signals.push('mention_only');
	}

	let ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
	if (!ranked.length) {
		ranked = [['general_chat', 0.4] as [AgentIntent, number]];
	}

	const [intent, topScore] = ranked[0];
	const second = ranked[1]?.[0];
	const confidence = Math.min(0.99, Math.max(0.45, topScore / (topScore + (ranked[1]?.[1] ?? 0.15) + 0.1)));

	for (const h of hits.slice(0, 4)) {
		signals.push(h.signal);
	}

	let resolved = intent;
	if (intent === 'edit_file' && (scores.get('improve_code') ?? 0) >= topScore - 0.05) {
		resolved = 'improve_code';
	}
	if (intent === 'plan_task' && /\[Execute approved plan\]/i.test(text)) {
		resolved = 'execute_plan';
	}

	const requiresEdits = EDIT_INTENTS.has(resolved)
		|| (paths.length > 0 && !['explain_code', 'search_codebase', 'general_chat', 'plan_task'].includes(resolved));
	const requiresTools = TOOL_INTENTS.has(resolved) || requiresEdits;

	return {
		intent: resolved,
		confidence,
		secondary: second ? [second] : [],
		requiresEdits,
		requiresTools,
		targetPaths: paths,
		suggestedSkill: skillForIntent(resolved),
		signals,
	};
}

export function buildIntentSystemBlock(classification: AgentIntentClassification): string {
	const lines = [
		'<classified_intent>',
		`primary: ${classification.intent} (confidence ${(classification.confidence * 100).toFixed(0)}%)`,
		`requires_edits: ${classification.requiresEdits}`,
		`requires_tools: ${classification.requiresTools}`,
	];
	if (classification.targetPaths.length) {
		lines.push(`target_paths: ${classification.targetPaths.join(', ')}`);
	}
	lines.push(
		'Follow this intent strictly:',
		intentGuidance(classification.intent),
		'</classified_intent>',
	);
	return lines.join('\n');
}

function intentGuidance(intent: AgentIntent): string {
	switch (intent) {
		case 'improve_code':
		case 'edit_file':
			return '- Read target file once, then propose_file_edit with valid ORIGINAL blocks. Do not stop at analysis.';
		case 'create_file':
			return '- list_files if needed, then write_file (preferred) or propose_file_edit with empty ORIGINAL for the new file.';
		case 'fix_bug':
			return '- Reproduce from code, fix minimally, verify with tests if possible.';
		case 'execute_plan':
			return '- Implement the approved plan with propose_file_edit; no more planning prose.';
		case 'explain_code':
			return '- Read-only: read_file/grep only; no propose_file_edit unless user asks to change code.';
		case 'plan_task':
			return '- Plan only: no propose_file_edit until user approves execution.';
		case 'review_code':
			return '- Review with read_file/grep; propose_file_edit only for concrete fixes.';
		case 'search_codebase':
			return '- Use grep/search_files/list_files; answer with findings.';
		case 'run_terminal':
			return '- Use run_terminal_command; report stdout/stderr.';
		default:
			return '- Use tools when the task involves the codebase.';
	}
}

/** Re-export for workflow quality checks */
export function intentRequiresDeliverableEdits(classification: AgentIntentClassification): boolean {
	return classification.requiresEdits;
}
