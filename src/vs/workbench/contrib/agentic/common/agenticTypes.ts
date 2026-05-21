/*--------------------------------------------------------------------------------------
 *  Agentic AI — shared domain types (browser + electron-main)
 *--------------------------------------------------------------------------------------*/

import type { JiraChatMessageUi } from './mcp/jiraWorkflowTypes.js';

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

/** Natural-language line shown under the user’s message while the agent works */
export interface ActivityLine {
	id: string;
	text: string;
	status: 'streaming' | 'complete';
	timestamp: number;
}

export interface ChatMessage {
	id: string;
	role: ChatMessageRole;
	content: string;
	createdAt: number;
	state?: AssistantMessageState;
	/** Interactive JIRA list / plan / stream embedded in chat */
	jiraChat?: JiraChatMessageUi;
	/** Live narration below the paired user message */
	activityLines?: ActivityLine[];
	/** Raw streamed model output (not persisted long-term) */
	streamRaw?: string;
	thinkingEvents?: ThinkingEvent[];
	toolCalls?: ToolCall[];
	toolResults?: ToolResult[];
}

export interface ApprovalRequest {
	id: string;
	toolCallId: string;
	title: string;
	description: string;
	preview?: string;
	decision: ApprovalDecision;
	createdAt: number;
}

export interface Checkpoint {
	id: string;
	createdAt: number;
	label: string;
	snapshotId?: string;
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
	| 'run_failed';

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
	updatedAt: number;
}

export type ChatThreadStatus = 'idle' | 'running' | 'waiting_approval' | 'failed' | 'completed';

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
	lastError?: string;
}
