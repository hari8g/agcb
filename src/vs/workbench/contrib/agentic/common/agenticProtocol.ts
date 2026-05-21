/*--------------------------------------------------------------------------------------
 *  Agentic AI — IPC protocol (serializable only; no callbacks)
 *--------------------------------------------------------------------------------------*/

import type { AgentEvent } from './agenticTypes.js';
import type { RuntimeRequest } from './llmMessageTypes.js';
import type { ApprovalDecision } from './agenticTypes.js';

export const AGENTIC_CHANNEL_NAME = 'agentic-channel-runtime';

// Commands (browser → main)
export type MainAgenticCommand =
	| 'startRun'
	| 'abortRun'
	| 'resolveApproval';

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
