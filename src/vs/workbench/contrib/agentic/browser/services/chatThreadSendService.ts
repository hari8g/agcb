/*--------------------------------------------------------------------------------------
 *  Agentic AI — send-path orchestration (extracted from chatThreadService)
 *--------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../../base/common/uuid.js';
import type { ChatMessage, ChatThread } from '../../common/agenticTypes.js';
import type { CodebaseContext } from '../../common/contextTypes.js';
import type { TemporalKnowledgeGraph } from '../../common/codebaseKnowledgeGraph.js';
import type { AgenticSettings } from '../../common/agenticSettingsTypes.js';
import type { ResolvedAgentCapabilities } from '../../common/agentCapabilities.js';
import type { VoidProviderConfig } from '../../common/voidProviderConfig.js';
import type { WorkflowExecutionPromptOptions } from '../../common/workflowExecutionTypes.js';
import type { JiraChatIntent } from '../../common/mcp/jiraChatIntent.js';
import { findAgentSkill } from '../../common/agentSkills.js';
import { getComposerAgentMode } from '../../common/agentModes.js';
import { shouldForcePlanOnlyForMode } from '../../common/agentModePermissions.js';
import { parseContextMentions } from '../../common/contextMentions.js';
import { resolveAgentCapabilities } from '../../common/agentCapabilities.js';
import { isExecutePhaseApproved } from '../../common/executePhaseGating.js';
import {
	completeWorkflowPhase,
	runWorkflowPreflight,
	type AgentWorkflowPhase,
} from '../../common/agentWorkflowOrchestration.js';
import { applyContextBudget } from '../../common/contextBudget.js';
import { emptyCodeGraphContext } from '../../common/contextTypes.js';
import { detectIssueKeyFromText } from './jiraWorkflowServiceInterface.js';
import { narrateWorkflowStage } from '../../common/mcp/jiraWorkflow.js';
import { convertToRuntimeRequest } from '../../common/llmMessageTypes.js';
import type { AgentRunPreflightResult } from './agentRunPreflightService.js';
import { bootstrapCanonicalSnapshotAfterPreflight } from '../../common/orchestration/canonicalWorkflowTracker.js';
import { createVerificationState } from '../../common/orchestration/verificationLoop.js';
import { buildAgentRunPreflight } from './agentRunPreflightService.js';
import { classifyStructuredIntent } from '../../common/orchestration/structuredIntent.js';
import { buildContextCollectionPlan, relatedTestPathHints } from '../../common/orchestration/contextStrategy.js';
import { isVoidLikeSimpleUiMode, resolveAgentRunUiMode } from '../../common/voidLikeChatMode.js';
import type { RuntimeRequest } from '../../common/llmMessageTypes.js';
import type { SerializableMcpTool } from '../../common/mcp/agenticMcpTypes.js';

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<T>(resolve => {
				timer = setTimeout(() => resolve(fallback), ms);
			}),
		]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

export type ChatThreadSendOutcome =
	| { kind: 'noop' }
	| { kind: 'jira_handled' }
	| { kind: 'provider_error'; message: string }
	| {
		kind: 'started';
		runId: string;
		thread: ChatThread;
		assistantMsg: ChatMessage;
		request: RuntimeRequest;
	};

export interface ChatThreadSendHost {
	readonly suppressJiraChatIntent: boolean;
	readonly settings: AgenticSettings;

	getThread(): ChatThread | null;
	detectJiraChatIntent(rawText: string, opts: { awaitingWorkflowDecision: boolean }): JiraChatIntent | null;
	isJiraAwaitingWorkflowDecision(): boolean;
	handleJiraChatIntent(rawText: string, intent: JiraChatIntent): Promise<void>;

	recordExplicitUserMessage(text: string): void;
	resolveMentionPaths(paths: string[]): Promise<string[]>;
	loadMentionSnippets(paths: string[]): Promise<string>;

	setLastFailedUserText(text: string): void;
	setActiveRunId(runId: string): void;
	appendActivityLine(
		msg: ChatMessage,
		text: string,
		status?: import('../../common/agenticTypes.js').ActivityLine['status'],
		lineId?: string,
		kind?: import('../../common/agenticTypes.js').ActivityLineKind,
	): void;
	completeActivityLine(msg: ChatMessage, lineId: string): void;
	advanceWorkflowPhase(
		thread: ChatThread,
		assistantMsg: ChatMessage,
		phase: AgentWorkflowPhase,
		detail?: string,
	): void;
	setLiveStatus(thread: ChatThread, partial: Omit<import('../../common/agenticTypes.js').LiveAgentStatus, 'updatedAt'>): void;
	notify(): void;
	notifyImmediate(): void;

	getWorkspaceRulesBlock(): Promise<string>;
	getSessionMemoryBlock(): Promise<string>;
	getKnowledgeGraphCached(): TemporalKnowledgeGraph | null;
	ensureKnowledgeGraphLoaded(): Promise<TemporalKnowledgeGraph | null>;
	backgroundKnowledgeGraphBuild(userText: string): void;
	collectContext(
		userText: string,
		opts: {
			includeActiveFile: boolean;
			includeSelection: boolean;
			semanticSearchLimit: number;
			dynamicDiscovery: boolean;
			extraContextBlocks?: string[];
			includeOpenTabs?: boolean;
			includeRecentFiles?: boolean;
			includeRelatedTests?: boolean;
			relatedTestPaths?: string[];
		},
		caps: ResolvedAgentCapabilities,
	): Promise<CodebaseContext>;

	beginRunMetrics(
		runId: string,
		threadId: string,
		opts: { intent?: string; complexity?: string; userMessage?: string },
	): void;

	startJiraWorkflow(issueKey: string): void;
	fetchJiraIssuesForMessage(text: string): Promise<CodebaseContext['jiraIssues']>;
	getJiraEnvDiagnosticsPrompt(): Promise<string | undefined>;

	getMcpTools(): SerializableMcpTool[];
	getMcpServerEnvs(): Promise<Record<string, Record<string, string | undefined>>>;

	analyzeSymbolTargets(
		paths: string[],
	): Promise<import('../../common/symbolImpactAnalysis.js').SymbolImpactAnalysis | null>;
	readTargetFilesParallel(
		paths: string[],
	): Promise<import('../../common/symbolImpactAnalysis.js').PreflightFileSnippet[]>;

	isVoidChatDisabled(): boolean;
	getVoidProviderConfig(): VoidProviderConfig | undefined;

	startRuntimeRun(params: {
		request: RuntimeRequest;
		thread: ChatThread;
		assistantMsg: ChatMessage;
		runId: string;
	}): void;
}

export async function executeChatThreadSend(
	host: ChatThreadSendHost,
	text: string,
	options?: WorkflowExecutionPromptOptions,
): Promise<ChatThreadSendOutcome> {
	const thread = host.getThread();
	if (!thread || !text.trim()) {
		return { kind: 'noop' };
	}

	let userText = text.trim();
	let skillAddendum: string | undefined;
	let planOnlyMode = false;
	const jiraExecutionRun = options?.jiraExecutionRun === true;
	if (jiraExecutionRun) {
		planOnlyMode = false;
		thread.workflowExecuteGated = false;
		thread.agentRunMode = 'execute_approved_plan';
		thread.autoApplyEdits = true;
		thread.jiraWorkflowAutonomous = true;
	}
	const executeApproved = jiraExecutionRun || isExecutePhaseApproved({
		userMessage: userText,
		agentRunMode: thread.agentRunMode,
	});

	if (thread.agentRunMode === 'execute_approved_plan') {
		thread.agentRunMode = 'default';
	} else {
		const skillMatch = findAgentSkill(userText);
		if (skillMatch) {
			thread.activeSkillId = skillMatch.skill.id;
			userText = [skillMatch.skill.promptPrefix, skillMatch.remainder || ''].filter(Boolean).join('\n\n');
			skillAddendum = skillMatch.skill.systemAddendum;
			if (skillMatch.skill.planOnly) {
				thread.agentRunMode = 'plan_only';
				planOnlyMode = true;
			}
		} else {
			thread.activeSkillId = undefined;
		}
	}

	const composerMode = getComposerAgentMode(thread.agentModeId);
	const isPlanComposer = composerMode.agentRunMode === 'plan_only';

	// Do not inherit plan-only from a previous turn when user is in Agent mode with a normal message
	if (
		thread.agentRunMode === 'plan_only'
		&& !isPlanComposer
		&& !planOnlyMode
		&& !executeApproved
		&& !/^\s*\/plan\b/i.test(text.trim())
	) {
		thread.agentRunMode = 'default';
		thread.workflowExecuteGated = false;
	}

	if (thread.agentRunMode === 'plan_only') {
		planOnlyMode = true;
	}
	if (shouldForcePlanOnlyForMode(thread.agentModeId)) {
		planOnlyMode = true;
		thread.agentRunMode = 'plan_only';
	}

	if (composerMode.agentRunMode === 'plan_only') {
		planOnlyMode = true;
		thread.agentRunMode = 'plan_only';
	}
	if (composerMode.sendPrefix && !/^\s*\//.test(userText)) {
		userText = `${composerMode.sendPrefix}${userText}`;
	}

	if (host.settings.enableSessionMemory) {
		host.recordExplicitUserMessage(userText);
	}

	const mentions = parseContextMentions(userText);
	const mentionPaths = await host.resolveMentionPaths(mentions.map(m => m.path));
	const mentionBlock = await host.loadMentionSnippets(mentionPaths);

	if (!host.suppressJiraChatIntent) {
		const chatIntent = host.detectJiraChatIntent(text, {
			awaitingWorkflowDecision: host.isJiraAwaitingWorkflowDecision(),
		});
		if (chatIntent) {
			await host.handleJiraChatIntent(text.trim(), chatIntent);
			return { kind: 'jira_handled' };
		}
	}

	host.setLastFailedUserText(userText);
	thread.updatedAt = Date.now();
	thread.status = 'running';
	thread.lastError = undefined;
	thread.orchestratorStallRetries = 0;

	const userMsg: ChatMessage = {
		id: generateUuid(),
		role: 'user',
		content: userText,
		createdAt: Date.now(),
	};
	thread.messages.push(userMsg);
	if (thread.messages.filter(m => m.role === 'user').length === 1) {
		thread.title = userText.replace(/^\[[^\]]+\]\s*/, '').slice(0, 48);
	}

	const assistantMsg: ChatMessage = {
		id: generateUuid(),
		role: 'assistant',
		content: '',
		createdAt: Date.now(),
		state: 'thinking',
		activityLines: [],
		streamRaw: '',
		toolCalls: [],
		toolResults: [],
	};
	thread.messages.push(assistantMsg);

	const runId = generateUuid();
	thread.currentRunId = runId;
	host.setActiveRunId(runId);
	host.setLiveStatus(thread, {
		phase: 'collecting_context',
		title: 'Preparing',
		detail: 'Gathering workspace context…',
	});
	host.notifyImmediate();

	const settings = host.settings;
	const caps = resolveAgentCapabilities(settings);
	const dynamicDiscovery = settings.dynamicContextDiscovery;
	const workspaceRulesBlock = settings.useWorkspaceRules
		? await host.getWorkspaceRulesBlock()
		: '';

	const workflowPreflight = runWorkflowPreflight({
		userMessage: userText,
		planOnlyMode,
		enableKnowledgeGraph: settings.enableKnowledgeGraph,
		baseHistoryLimit: caps.historyMessageLimit,
		baseSemanticMatches: caps.maxSemanticMatches,
		profile: settings.capabilityProfile,
	});
	thread.workflowSnapshot = workflowPreflight.snapshot;
	const pipeline = workflowPreflight.pipeline;
	const agentModeId = thread.agentModeId ?? 'agent';
	thread.runUiMode = jiraExecutionRun
		? 'orchestrated'
		: resolveAgentRunUiMode({
			complexity: workflowPreflight.snapshot.complexity,
			planOnlyMode,
			agentModeId,
			workflowExecuteGated: thread.workflowExecuteGated,
		});
	const voidLikeUi = jiraExecutionRun ? false : isVoidLikeSimpleUiMode(thread.runUiMode);

	host.beginRunMetrics(runId, thread.id, {
		intent: workflowPreflight.snapshot.intent.intent,
		complexity: workflowPreflight.snapshot.complexity,
		userMessage: userText,
	});

	if (!voidLikeUi) {
		host.advanceWorkflowPhase(
			thread,
			assistantMsg,
			'intent_parse',
			`Intent: ${workflowPreflight.snapshot.intent.intent.replace(/_/g, ' ')}`,
		);
		host.advanceWorkflowPhase(
			thread,
			assistantMsg,
			'classify',
			`${workflowPreflight.snapshot.complexity} task · ${workflowPreflight.snapshot.phases.length} phases`,
		);
	} else {
		host.setLiveStatus(thread, {
			phase: 'collecting_context',
			title: 'Agent',
			detail: 'Preparing…',
		});
	}

	const isSimpleFastPath =
		workflowPreflight.snapshot.complexity === 'simple'
		|| workflowPreflight.snapshot.intent.intent === 'create_file';
	const contextCollectTimeoutMs = isSimpleFastPath ? 8_000 : 20_000;
	const knowledgeGraphTimeoutMs = isSimpleFastPath ? 4_000 : 12_000;

	let knowledgeGraph: TemporalKnowledgeGraph | null = null;
	if (!voidLikeUi) {
		host.advanceWorkflowPhase(thread, assistantMsg, 'context_graph', 'Loading workspace map…');
	}
	if (pipeline.preflightKnowledgeGraph) {
		knowledgeGraph = host.getKnowledgeGraphCached()
			?? await withTimeout(host.ensureKnowledgeGraphLoaded(), knowledgeGraphTimeoutMs, null);
		host.backgroundKnowledgeGraphBuild(userText);
	} else if (settings.enableKnowledgeGraph) {
		knowledgeGraph = host.getKnowledgeGraphCached();
	}
	completeWorkflowPhase(thread.workflowSnapshot, 'context_graph');

	const earlyIntent = classifyStructuredIntent(userText, { planOnlyMode });
	const earlyContextPlan = buildContextCollectionPlan(earlyIntent, {
		includeActiveFile: thread.includeActiveFile,
		includeSelection: thread.includeSelection,
		baseSemanticLimit: pipeline.maxSemanticMatches,
		maxContextChars: settings.maxContextChars,
		useWorkspaceRules: settings.useWorkspaceRules,
	});
	const relatedTests = earlyContextPlan.includeRelatedTests
		? earlyIntent.explicitPaths.flatMap(relatedTestPathHints)
		: [];

	const extraBlocks = [mentionBlock].filter(Boolean);
	let context = applyContextBudget(
		await withTimeout(
			host.collectContext(userText, {
				includeActiveFile: earlyContextPlan.includeActiveFile,
				includeSelection: earlyContextPlan.includeSelection,
				semanticSearchLimit: earlyContextPlan.semanticSearchLimit,
				dynamicDiscovery,
				extraContextBlocks: extraBlocks.length ? extraBlocks : undefined,
				includeOpenTabs: earlyContextPlan.includeOpenTabs,
				includeRecentFiles: earlyContextPlan.includeRecentFiles,
				includeRelatedTests: earlyContextPlan.includeRelatedTests,
				relatedTestPaths: relatedTests,
			}, caps),
			contextCollectTimeoutMs,
			{
				workspaceFolderUris: [],
				userMessage: userText,
				activeFilePath: null,
				activeFileLanguageId: null,
				activeFileContent: null,
				selectedCode: null,
				selectionRange: null,
				openTabs: [],
				gitBranch: null,
				recentFiles: [],
				checkpointId: null,
				codeGraph: emptyCodeGraphContext(),
				jiraIssues: [],
				collectedAt: Date.now(),
			},
		),
		{
			...pipeline.contextBudget,
			compactActiveFile: settings.compactActiveFileInContext && pipeline.contextBudget.compactActiveFile,
			maxContextChars: settings.maxContextChars,
		},
		knowledgeGraph,
	);

	const issueKey = options?.jiraWorkflowIssueKey ?? detectIssueKeyFromText(text);
	const jiraWorkflowIssueKey = options?.jiraWorkflowIssueKey
		?? (settings.enableJiraWorkflow && issueKey ? issueKey : undefined);

	if (jiraWorkflowIssueKey) {
		host.startJiraWorkflow(jiraWorkflowIssueKey);
		host.appendActivityLine(
			assistantMsg,
			narrateWorkflowStage('fetch', jiraWorkflowIssueKey),
			'streaming',
			'status-jira-fetch',
		);
		try {
			context.jiraIssues = await host.fetchJiraIssuesForMessage(text);
			host.completeActivityLine(assistantMsg, 'status-jira-fetch');
			for (const issue of context.jiraIssues) {
				const failed = issue.rawText?.includes('<jira_fetch_status>FAILED</jira_fetch_status>');
				if (failed) {
					const kindMatch = issue.rawText?.match(/<jira_fetch_failure kind="([^"]+)">/);
					const kind = kindMatch?.[1] ?? 'unknown';
					host.appendActivityLine(
						assistantMsg,
						`JIRA pre-fetch failed for ${issue.issueKey} (${kind}) — see diagnostics in reply`,
						'complete',
					);
				} else {
					host.appendActivityLine(
						assistantMsg,
						issue.summary ? `Loaded ${issue.issueKey}: ${issue.summary}` : `Loaded ${issue.issueKey} from JIRA`,
						'complete',
					);
				}
			}
		} catch (e) {
			host.appendActivityLine(
				assistantMsg,
				`Could not fetch JIRA ticket: ${e instanceof Error ? e.message : String(e)}`,
				'complete',
			);
		}
	}

	if (!voidLikeUi) {
		if (thread.workflowSnapshot.phases.includes('plan')) {
			host.advanceWorkflowPhase(thread, assistantMsg, 'plan', 'Structuring execution steps…');
		}
		if (thread.workflowSnapshot.phases.includes('analyse')) {
			host.advanceWorkflowPhase(thread, assistantMsg, 'analyse', 'Mapping relevant code…');
		}
		if (thread.workflowSnapshot.phases.includes('impact')) {
			host.advanceWorkflowPhase(thread, assistantMsg, 'impact', 'Estimating blast radius…');
		}
	}

	const sessionMemoryBlock = settings.enableSessionMemory
		? await host.getSessionMemoryBlock()
		: '';

	const runPreflight = await buildAgentRunPreflight({
		runId,
		userMessage: userText,
		planOnlyMode,
		executeApproved,
		voidLikeSimple: voidLikeUi,
		settings,
		caps,
		mentionBlock,
		context,
		knowledgeGraph,
		pipeline,
		includeActiveFile: thread.includeActiveFile,
		includeSelection: thread.includeSelection,
		sessionMemoryBlock,
		analyzeSymbolTargets: paths => withTimeout(
			host.analyzeSymbolTargets(paths),
			10_000,
			null,
		),
		readTargetFilesParallel: paths => withTimeout(
			host.readTargetFilesParallel(paths),
			12_000,
			[],
		),
	});

	applyPreflightToThread(thread, runPreflight, runPreflight.context);
	context = runPreflight.context;

	if (!voidLikeUi) {
		if (thread.workflowSnapshot.plan) {
			host.appendActivityLine(
				assistantMsg,
				`Plan: ${thread.workflowSnapshot.plan.steps.length} step(s) · ${thread.workflowSnapshot.plan.risk} risk`,
				'complete',
				'wf-plan-summary',
				'orchestrator',
			);
		}
		if (thread.workflowSnapshot.impact) {
			host.appendActivityLine(
				assistantMsg,
				`Impact: ${thread.workflowSnapshot.impact.blastRadiusSummary}`,
				'complete',
				'wf-impact-summary',
				'orchestrator',
			);
		}
		host.advanceWorkflowPhase(
			thread,
			assistantMsg,
			'execute',
			thread.lastIntent?.targetPaths[0]?.split(/[/\\]/).pop() ?? 'Starting agent…',
		);
	} else {
		host.setLiveStatus(thread, {
			phase: 'thinking',
			title: 'Agent',
			detail: thread.lastIntent?.targetPaths[0]?.split(/[/\\]/).pop() ?? 'Working…',
		});
	}

	const mcpTools = host.getMcpTools();
	const mcpServerEnv = await host.getMcpServerEnvs();
	const jiraEnvDiagnosticsPrompt = jiraWorkflowIssueKey
		? await host.getJiraEnvDiagnosticsPrompt()
		: undefined;
	host.notify();

	const chatDisabled = host.isVoidChatDisabled();
	let runtimeMode = settings.runtimeMode;
	let voidProvider: VoidProviderConfig | undefined;

	if (settings.providerType === 'void' && !chatDisabled) {
		voidProvider = host.getVoidProviderConfig();
		runtimeMode = 'local_provider';
	} else if (chatDisabled && settings.providerType === 'void') {
		assistantMsg.state = 'error';
		assistantMsg.content = 'Configure a Chat model in Agentic_MPS Settings or switch Agentic provider to OpenAI-compatible.';
		thread.status = 'failed';
		thread.currentRunId = null;
		host.setLiveStatus(thread, { phase: 'error', title: 'No model configured', detail: 'Open Agentic_MPS Settings' });
		host.notifyImmediate();
		return { kind: 'provider_error', message: assistantMsg.content };
	}

	const modelName = settings.providerType === 'void' && voidProvider
		? voidProvider.modelName
		: settings.model;

	const request = convertToRuntimeRequest(
		thread,
		context,
		{
			runtimeMode,
			model: modelName,
			settings,
			autoApplyEdits: thread.autoApplyEdits,
			mcpTools,
			mcpServerEnv,
			jiraWorkflowIssueKey,
			jiraEnvDiagnosticsPrompt,
			historyMessageLimit: pipeline.historyMessageLimit,
			maxContextChars: settings.maxContextChars,
			workspaceRulesBlock: workspaceRulesBlock || undefined,
			skillSystemAddendum: skillAddendum,
			dynamicContextDiscovery: dynamicDiscovery,
			planOnlyMode,
			intentSystemBlock: runPreflight.intentSystemBlock,
			toolRouterSystemBlock: runPreflight.toolRouterSystemBlock,
			executeGatingSystemBlock: runPreflight.executeGatingSystemBlock,
			sessionMemoryBlock: runPreflight.sessionMemoryBlock || undefined,
			workflowOrchestrationBlock: runPreflight.workflowOrchestrationBlock,
			executePhaseGating: runPreflight.executePhaseGating,
			voidLikeSimple: voidLikeUi,
			jiraWorkflowExecution: jiraExecutionRun,
		},
		runId,
	);
	request.voidProvider = voidProvider;
	request.options.externalGatewayUrl = settings.runtimeBaseUrl;
	request.options.apiKeyEnvVar = settings.apiKeyEnvVar;
	request.options.requestTimeoutMs = settings.requestTimeoutMs;

	host.setLiveStatus(thread, {
		phase: 'thinking',
		title: voidLikeUi ? 'Agent' : 'Agent run',
		detail: voidLikeUi ? 'Working…' : `Model: ${modelName}`,
	});
	host.notifyImmediate();

	host.startRuntimeRun({ request, thread, assistantMsg, runId });

	return { kind: 'started', runId, thread, assistantMsg, request };
}

function applyPreflightToThread(
	thread: ChatThread,
	runPreflight: AgentRunPreflightResult,
	context: CodebaseContext,
): void {
	thread.workflowSnapshot = runPreflight.snapshot;
	thread.workflowExecuteGated = runPreflight.executePhaseGating;
	thread.structuredIntent = runPreflight.structuredIntent;
	thread.workflowRunPlan = runPreflight.workflowRunPlan;
	if (!isVoidLikeSimpleUiMode(thread.runUiMode)) {
		thread.canonicalPhases = runPreflight.canonicalPhases;
		thread.canonicalWorkflowSnapshot = bootstrapCanonicalSnapshotAfterPreflight(
			runPreflight.canonicalPhases,
			{
				hasPlan: !!runPreflight.snapshot.plan,
				hasImpact: !!runPreflight.snapshot.impact,
				approvalPending: runPreflight.executePhaseGating === true,
			},
		);
	} else {
		thread.canonicalPhases = undefined;
		thread.canonicalWorkflowSnapshot = undefined;
	}
	thread.verificationState = createVerificationState();
	const intent = runPreflight.snapshot.intent;
	thread.lastIntent = {
		intent: intent.intent,
		confidence: intent.confidence,
		requiresEdits: intent.requiresEdits,
		requiresTools: intent.requiresTools,
		targetPaths: intent.targetPaths.length
			? intent.targetPaths
			: (context.activeFilePath ? [context.activeFilePath] : []),
	};
}
