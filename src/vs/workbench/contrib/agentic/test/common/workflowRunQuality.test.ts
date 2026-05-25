/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	analyzeWorkflowRunQuality,
	inferCompletionKindFromQuality,
} from '../../common/workflowRunQuality.js';
import {
	buildWorkflowCompletionSummary,
} from '../../common/workflowSummary.js';
import type { ChatMessage } from '../../common/agenticTypes.js';

suite('workflowRunQuality', () => {
	test('detects failed empty propose_file_edit runs', () => {
		const assistant: ChatMessage = {
			id: 'a',
			role: 'assistant',
			content: 'The User model is still not present in models.py after multiple attempts.',
			createdAt: 0,
			state: 'complete',
			toolCalls: [
				{
					id: 't1',
					name: 'propose_file_edit',
					arguments: { path: 'models.py', searchReplaceBlocks: '' },
					status: 'failed',
					resultPreview: 'searchReplaceBlocks is empty',
				},
				{
					id: 't2',
					name: 'read_file',
					arguments: { path: 'models.py' },
					status: 'complete',
				},
			],
			toolResults: [
				{ toolCallId: 't1', content: 'searchReplaceBlocks is empty', isError: true },
				{ toolCallId: 't2', content: 'class Vehicle', isError: false },
			],
			touchedFiles: [{ path: 'models.py', status: 'failed', updatedAt: 1 }],
		};
		const q = analyzeWorkflowRunQuality(assistant);
		assert.strictEqual(q.emptyBlockEditAttempts, 1);
		assert.strictEqual(q.successfulEditAttempts, 0);
		assert.ok(q.outcomeClaimsFailure);
		const kind = inferCompletionKindFromQuality(q, true, false);
		assert.strictEqual(kind, 'failed');
		const summary = buildWorkflowCompletionSummary({
			userMessage: 'add User model',
			assistantMessage: assistant,
			runQuality: q,
		});
		assert.strictEqual(summary.completionKind, 'failed');
		assert.ok(summary.outcome.includes('Blockers'));
	});

	test('successful write_file counts as delivered edit', () => {
		const assistant: ChatMessage = {
			id: 'w',
			role: 'assistant',
			content: 'Updated package.json.',
			createdAt: 0,
			state: 'complete',
			toolCalls: [
				{
					id: 'wf',
					name: 'write_file',
					arguments: { path: 'package.json', content: { version: '2.0.0' } },
					status: 'complete',
					resultPreview: 'Wrote package.json',
				},
			],
			toolResults: [
				{ toolCallId: 'wf', content: 'Wrote package.json (120 bytes)', isError: false },
			],
			touchedFiles: [{ path: 'package.json', status: 'applied', updatedAt: 1 }],
		};
		const q = analyzeWorkflowRunQuality(assistant, 'update package.json');
		assert.strictEqual(q.successfulEditAttempts, 1);
		assert.strictEqual(q.deliveryIncomplete, false);
	});

	test('read-only improve task marks delivery incomplete as failed', () => {
		const assistant: ChatMessage = {
			id: 'a2',
			role: 'assistant',
			content: 'Completed 4 tool step(s).',
			createdAt: 0,
			state: 'complete',
			toolCalls: [
				{ id: 'r1', name: 'read_file', arguments: { path: 'backend/app/models.py' }, status: 'complete' },
				{ id: 'r2', name: 'read_file', arguments: { path: 'backend/app/models.py' }, status: 'complete' },
			],
			toolResults: [
				{ toolCallId: 'r1', content: 'class Vehicle', isError: false },
				{ toolCallId: 'r2', content: 'class Vehicle', isError: false },
			],
		};
		const q = analyzeWorkflowRunQuality(assistant, 'Improve @backend/app/models.py');
		assert.strictEqual(q.deliveryIncomplete, true);
		assert.strictEqual(q.successfulEditAttempts, 0);
		const kind = inferCompletionKindFromQuality(q, true, false);
		assert.strictEqual(kind, 'failed');
		const summary = buildWorkflowCompletionSummary({
			userMessage: 'Improve @backend/app/models.py',
			assistantMessage: assistant,
			runQuality: q,
		});
		assert.strictEqual(summary.completionKind, 'failed');
	});
});
