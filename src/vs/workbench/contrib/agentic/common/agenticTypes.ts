/*--------------------------------------------------------------------------------------
 *  Agentic AI — shared domain types (browser + electron-main)
 *--------------------------------------------------------------------------------------*/

import type { JiraChatMessageUi } from './mcp/jiraWorkflowTypes.js';
import type { ChatDecision } from './chatDecisionTypes.js';
import type { WorkflowCompletionSummary } from './workflowSummary.js';

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type AssistantMessageState =
	| 'idle'
	| 'thinking'
	| 'streaming'
	| 'waiting_for_tool'
	| 'waiting_for_approval'
	| 'complete'
	| 'error';

export type ThinkingEventStatus = 'pending' | 'running' | 'complete' | 'failed';

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled';

export type AgentRunStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';

export type ApprovalDecision = 'approved' | 'rejected' | 'pending';

/** Activity kinds shown in the agent timeline UI */
export type AgentActivityKind =
	| 'reading'
	| 'searching'
	| 'planning'
	| 'tool_call'
	| 'editing'
	| 'terminal'
	| 'approval'
	| 'completed'
	| 'other';

export interface ThinkingEvent {
	id: string;
	timestamp: number;
	title: string;
	description?: string;
	status: ThinkingEventStatus;
	kind?: AgentActivityKind;
	metadata?: Record<string, unknown>;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	status: ToolCallStatus;
	startedAt?: number;
	completedAt?: number;
	resultPreview?: string;
	error?: string;
}

export interface ToolResult {
	toolCallId: string;
	content: string;
	isError: boolean;
}

export type ActivityLineKind = 'status' | 'reasoning' | 'tool' | 'orchestrator';

/** Natural-language line shown under the user’s message while the agent works */
export interface ActivityLine {
	id: string;
	text: string;
	status: 'streaming' | 'complete';
	timestamp: number;
	kind?: ActivityLineKind;
}

/** File the agent read or edited during an assistant turn */
export type TouchedFileStatus = 'read' | 'preview' | 'applied' | 'rejected' | 'failed';

export interface TouchedFile {
	path: string;
	status: TouchedFileStatus;
	updatedAt: number;
}

export interface ChatMessage {
	id: string;
	role: ChatMessageRole;
	content: string;
	createdAt: number;
	state?: AssistantMessageState;
	/** Interactive JIRA list / plan / stream embedded in chat */
	jiraChat?: JiraChatMessageUi;
	/** Proceed / decline (or approve / reject) — replaces "can I continue?" chat text */
	decision?: ChatDecision;
	/** Live narration below the paired user message */
	activityLines?: ActivityLine[];
	/** Raw streamed model output (not persisted long-term) */
	streamRaw?: string;
	thinkingEvents?: ThinkingEvent[];
	toolCalls?: ToolCall[];
	toolResults?: ToolResult[];
	/** Files opened or edited this turn — shown in the workflow orchestration strip */
	touchedFiles?: TouchedFile[];
	/** Structured end-of-run summary when the workflow completes */
	workflowSummary?: WorkflowCompletionSummary;
}

export interface ApprovalBatchItem {
	toolCallId: string;
	toolName: string;
	title: string;
	description: string;
	preview?: string;
	filePath?: string;
}

export interface ApprovalRequest {
	id: string;
	toolCallId: string;
	title: string;
	description: string;
	preview?: string;
	decision: ApprovalDecision;
	createdAt: number;
	/** Present when multiple edits are batched into one approval */
	batchId?: string;
	items?: ApprovalBatchItem[];
	toolName?: string;
	filePath?: string;
	messageId?: string;
}

export interface Checkpoint {
	id: string;
	createdAt: number;
	label: string;
	snapshotId?: string;
	/** Files captured in the snapshot (when known). */
	fileCount?: number;
	/** Workspace-relative paths in snapshot (for UI preview). */
	paths?: string[];
}

export interface AgentRun {
	id: string;
	threadId: string;
	status: AgentRunStatus;
	startedAt: number;
	completedAt?: number;
	error?: string;
}

export type AgentEventType =
	| 'run_started'
	| 'activity_narrative'
	| 'thinking_started'
	| 'thinking_delta'
	| 'context_collected'
	| 'model_stream_delta'
	| 'tool_call_started'
	| 'tool_call_delta'
	| 'tool_call_completed'
	| 'tool_call_failed'
	| 'approval_required'
	| 'edit_preview_created'
	| 'checkpoint_created'
	| 'run_completed'
	| 'run_failed'
	/** Main-process observability forwarded to renderer (DevTools only). */
	| 'workflow_log';

export interface AgentEvent {
	type: AgentEventType;
	runId: string;
	timestamp: number;
	payload: Record<string, unknown>;
}

export interface StreamingDelta {
	text: string;
}

export type LiveAgentPhase =
	| 'idle'
	| 'parsing'
	| 'collecting_context'
	| 'thinking'
	| 'streaming'
	| 'tool'
	| 'approval'
	| 'complete'
	| 'error';

/** Headline status shown in the Agentic sidebar status bar during a run */
export interface LiveAgentStatus {
	phase: LiveAgentPhase;
	title: string;
	detail?: string;
	/** 0–100 when known (e.g. streaming progress estimate) */
	progress?: number;
	/** Current step in Intent→Classify→ContextGraph→Plan→Analyse→Impact→Execute pipeline */
	workflowPhase?: import('./agentWorkflowOrchestration.js').AgentWorkflowPhase;
	updatedAt: number;
}

export type { AgentWorkflowSnapshot, AgentWorkflowPhase } from './agentWorkflowOrchestration.js';

export type ChatThreadStatus = 'idle' | 'running' | 'waiting_approval' | 'failed' | 'completed';

export type AgentThreadRunMode = 'default' | 'plan_only' | 'execute_approved_plan';

export interface ChatThread {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	status: ChatThreadStatus;
	messages: ChatMessage[];
	currentRunId: string | null;
	currentCheckpointId: string | null;
	liveStatus: LiveAgentStatus | null;
	approvalRequests: ApprovalRequest[];
	checkpoints: Checkpoint[];
	includeActiveFile: boolean;
	includeSelection: boolean;
	autoApplyEdits: boolean;
	/** After accepting a JIRA workflow plan, relax read-only JIRA/MCP gates for this thread */
	jiraWorkflowAutonomous?: boolean;
	/** Cursor-style plan → execute flow */
	agentRunMode?: AgentThreadRunMode;
	/** Composer mode: agent | plan | debug */
	agentModeId?: import('./agentModes.js').ComposerAgentModeId;
	activeSkillId?: string;
	lastError?: string;
	/** Auto-continue attempts after plan-only stall in this thread */
	orchestratorStallRetries?: number;
	/** Last classified developer intent for this thread run */
	lastIntent?: AgentIntentClassificationRef;
	/** Pre-execution workflow orchestration snapshot for the active run */
	workflowSnapshot?: import('./agentWorkflowOrchestration.js').AgentWorkflowSnapshot;
	/** Last run blocked write tools until plan approval (complex / plan-only) */
	workflowExecuteGated?: boolean;
	/** Canonical orchestration intent for active run */
	structuredIntent?: import('./orchestration/structuredIntent.js').StructuredIntent;
	/** Canonical run plan (preflight) */
	workflowRunPlan?: import('./orchestration/workflowRunPlanner.js').WorkflowRunPlan;
	/** Canonical phase track for UI */
	canonicalPhases?: import('./orchestration/workflowPhases.js').CanonicalWorkflowPhase[];
	/** Live canonical phase progress for orchestration strip */
	canonicalWorkflowSnapshot?: import('./orchestration/canonicalWorkflowTracker.js').CanonicalWorkflowSnapshot;
	/** Verification loop state for quality report + repair_once */
	verificationState?: import('./orchestration/verificationLoop.js').VerificationState;
	/** void-simple = minimal UI/loop; orchestrated = full workflow chrome */
	runUiMode?: import('./voidLikeChatMode.js').AgentRunUiMode;
}

/** Avoid circular imports in types — mirror of AgentIntentClassification */
export interface AgentIntentClassificationRef {
	intent: string;
	confidence: number;
	requiresEdits: boolean;
	requiresTools: boolean;
	targetPaths: string[];
}
