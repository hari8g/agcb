/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	createEmptyInteractiveState,
	jiraInteractiveToChatUi,
	type InteractiveJiraWorkflowState,
} from '../../common/mcp/jiraWorkflowTypes.js';
import type { WorkflowCompletionSummary } from '../../common/workflowSummary.js';

suite('jira workflow intelligent agent', () => {
	test('jiraInteractiveToChatUi uses stalled mode when agent did not run tools', () => {
		const base = createEmptyInteractiveState();
		const summary: WorkflowCompletionSummary = {
			asked: 'Implement KAN-1',
			approach: ['Review plan'],
			actions: [],
			filesTouched: [],
			outcome: 'Will create module',
			completionKind: 'stalled',
			generatedAt: Date.now(),
		};
		const interactive: InteractiveJiraWorkflowState = {
			...base,
			phase: 'failed',
			selectedTicket: { key: 'KAN-1', summary: 'Test' },
			agentRunStalled: true,
			agentExecutionSummary: summary,
		};
		const ui = jiraInteractiveToChatUi(interactive);
		assert.strictEqual(ui.mode, 'stalled');
		assert.strictEqual(ui.agentRunStalled, true);
		assert.strictEqual(ui.agentExecutionSummary?.completionKind, 'stalled');
	});

	test('jiraInteractiveToChatUi keeps ticket detail on non-stall failure', () => {
		const base = createEmptyInteractiveState();
		const interactive: InteractiveJiraWorkflowState = {
			...base,
			phase: 'failed',
			selectedTicket: { key: 'KAN-2', summary: 'Other' },
			error: 'MCP error',
			agentRunStalled: false,
			agentExecutionSummary: null,
		};
		const ui = jiraInteractiveToChatUi(interactive);
		assert.strictEqual(ui.mode, 'detail');
	});
});
