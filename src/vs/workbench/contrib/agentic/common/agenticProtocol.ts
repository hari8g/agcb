/*--------------------------------------------------------------------------------------
 *  Agentic AI — IPC protocol (serializable only; no callbacks)
 *--------------------------------------------------------------------------------------*/

import type { AgentEvent } from './agenticTypes.js';
import type { RuntimeRequest } from './llmMessageTypes.js';
import type { ApprovalDecision } from './agenticTypes.js';

export const AGENTIC_CHANNEL_NAME = 'agentic-channel-runtime';

/** Workbench channel: main → renderer for lint and other IDE-bound tools */
export const AGENTIC_RENDERER_TOOLS_CHANNEL = 'agentic-renderer-tools';

// Commands (browser → main)
export type MainAgenticCommand =
	| 'startRun'
	| 'abortRun'
	| 'resolveApproval'
	| 'injectRunMessage'
	| 'restoreCheckpoint'
	| 'getCheckpointSnapshot';

export interface MainStartRunParams {
	requestId: string;
	request: RuntimeRequest;
}

export interface MainAbortRunParams {
	requestId: string;
}

export interface MainResolveApprovalParams {
	requestId: string;
	runId: string;
	approvalId: string;
	decision: ApprovalDecision;
}

/** Browser → main: inject an orchestrator user turn into a running agent loop */
export interface MainInjectRunMessageParams {
	requestId: string;
	content: string;
}

/** Browser → main: restore workspace files from an agent checkpoint snapshot */
export interface MainRestoreCheckpointParams {
	checkpointId: string;
	workspaceFolder: string;
}

export interface MainRestoreCheckpointResult {
	ok: boolean;
	message: string;
	restoredPaths: string[];
}

export interface MainGetCheckpointSnapshotParams {
	checkpointId: string;
}

export interface MainGetCheckpointSnapshotResult {
	found: boolean;
	checkpointId: string;
	createdAt: number;
	files: { path: string; content: string }[];
}

// Events (main → browser)
export type AgenticChannelEvent =
	| 'onAgentEvent'
	| 'onRunError';

export interface EventAgentEventParams {
	requestId: string;
	event: AgentEvent;
}

export interface EventRunErrorParams {
	requestId: string;
	message: string;
	fullError?: string;
}

// Browser service API (with callbacks)
export interface ServiceStartRunParams {
	request: RuntimeRequest;
	onEvent: (event: AgentEvent) => void;
	onError: (params: { message: string; fullError: Error | null }) => void;
}

export interface ServiceResolveApprovalParams {
	requestId: string;
	runId: string;
	approvalId: string;
	decision: ApprovalDecision;
	onEvent: (event: AgentEvent) => void;
	onError: (params: { message: string; fullError: Error | null }) => void;
}
