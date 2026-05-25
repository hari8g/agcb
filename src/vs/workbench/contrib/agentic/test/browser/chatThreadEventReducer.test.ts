/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { AgentEvent, ChatMessage, ChatThread } from '../../common/agenticTypes.js';
import { DEFAULT_AGENTIC_SETTINGS } from '../../common/agenticSettingsTypes.js';
import {
	LIVE_THOUGHT_LINE_ID,
	reduceChatThreadEvent,
	type ChatThreadEventReducerHost,
} from '../../browser/services/chatThreadEventReducer.js';

function emptyThread(): ChatThread {
	return {
		id: 't1',
		title: 'Test',
		createdAt: 0,
		updatedAt: 0,
		status: 'idle',
		messages: [],
		approvalRequests: [],
		checkpoints: [],
		currentCheckpointId: null,
		currentRunId: null,
		liveStatus: null,
		includeActiveFile: false,
		includeSelection: false,
		autoApplyEdits: true,
	};
}

function emptyAssistant(): ChatMessage {
	return {
		id: 'a1',
		role: 'assistant',
		content: '',
		createdAt: 0,
		state: 'thinking',
	};
}

function mockHost(overrides: Partial<ChatThreadEventReducerHost> = {}): ChatThreadEventReducerHost {
	const calls: string[] = [];
	const base: ChatThreadEventReducerHost = {
		settings: DEFAULT_AGENTIC_SETTINGS,
		jiraWorkflowExecuting: false,
		appendActivityLine: () => { calls.push('appendActivityLine'); },
		completeActivityLine: () => { calls.push('completeActivityLine'); },
		appendThinkingEvent: () => { },
		completeThinkingEvents: () => { },
		setLiveStatus: () => { calls.push('setLiveStatus'); },
		scheduleUiNotify: () => { calls.push('scheduleUiNotify'); },
		notifyImmediate: () => { calls.push('notifyImmediate'); },
		recordTouchedFile: () => { },
		revealTouchedFileInEditor: () => { },
		noteFileRevealed: () => { },
		runPostEditLintVerify: () => { },
		previewProposeEditTool: () => { },
		previewProposeEditsForApproval: () => { },
		recordJiraFileChange: () => { },
		applyWriteFile: () => { },
		applyProposeFileEdit: () => { },
		cancelProposeFileEdit: () => { },
		setEditApprovalPending: () => { },
		recordSessionMemoryFromRun: () => { },
		finishMetricsRun: () => { },
		resolveRunWait: () => { },
		workflowRunMetadata: () => ({}),
		sendUserMessage: () => { },
		autoContinueAfterStall: () => { },
		clearActiveRun: () => { },
		setLastFailedUserText: () => { },
	};
	return new Proxy(base, {
		get(target, prop) {
			if (prop in overrides) {
				return (overrides as unknown as Record<string | symbol, unknown>)[prop];
			}
			return (target as unknown as Record<string | symbol, unknown>)[prop];
		},
	}) as ChatThreadEventReducerHost;
}

suite('chatThreadEventReducer', () => {
	test('run_started sets thread status to running', () => {
		const thread = emptyThread();
		const msg = emptyAssistant();
		const event: AgentEvent = { type: 'run_started', runId: 'run-1', timestamp: 1, payload: {} };
		const { skipFinalNotify } = reduceChatThreadEvent(mockHost(), thread, msg, event);
		assert.strictEqual(thread.status, 'running');
		assert.strictEqual(skipFinalNotify, false);
	});

	test('model_stream_delta requests skipFinalNotify and schedules UI notify', () => {
		const thread = emptyThread();
		const msg = emptyAssistant();
		let scheduled = false;
		const host = mockHost({
			scheduleUiNotify: () => { scheduled = true; },
		});
		const event: AgentEvent = {
			type: 'model_stream_delta',
			runId: 'run-1',
			timestamp: 1,
			payload: { text: 'Hello world' },
		};
		const { skipFinalNotify } = reduceChatThreadEvent(host, thread, msg, event);
		assert.strictEqual(skipFinalNotify, true);
		assert.strictEqual(scheduled, true);
		assert.ok(msg.content?.includes('Hello') || (msg.activityLines?.length ?? 0) > 0);
	});

	test('tool_call_started completes live thought line', () => {
		const thread = emptyThread();
		const msg = emptyAssistant();
		let completedLineId: string | undefined;
		const host = mockHost({
			completeActivityLine: (_m, lineId) => { completedLineId = lineId; },
		});
		const event: AgentEvent = {
			type: 'tool_call_started',
			runId: 'run-1',
			timestamp: 1,
			payload: { name: 'read_file', toolCallId: 'tc1', arguments: { path: 'a.ts' } },
		};
		reduceChatThreadEvent(host, thread, msg, event);
		assert.strictEqual(completedLineId, LIVE_THOUGHT_LINE_ID);
		assert.strictEqual(msg.toolCalls?.length, 1);
		assert.strictEqual(msg.toolCalls?.[0].name, 'read_file');
	});
});
