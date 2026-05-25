/*---------------------------------------------------------------------------------------------
 *  Agentic AI — run metrics tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	aggregateMetricsDashboard,
	buildRunMetricFromAssistantMessage,
	createRunMetricRecord,
} from '../../common/agentRunMetrics.js';
import type { ChatMessage } from '../../common/agenticTypes.js';

suite('Agentic agentRunMetrics', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('aggregateMetricsDashboard computes success rate', () => {
		const base = createRunMetricRecord('r1', 't1');
		const runs = [
			{ ...base, runId: 'r1', status: 'completed' as const, durationMs: 1000, toolCalls: 2, toolErrors: 0, successfulEdits: 1, editAttempts: 1 },
			{ ...base, runId: 'r2', status: 'failed' as const, durationMs: 500, toolCalls: 1, toolErrors: 1, successfulEdits: 0, editAttempts: 0 },
		];
		const dash = aggregateMetricsDashboard(runs);
		assert.strictEqual(dash.totalRuns, 2);
		assert.strictEqual(dash.completedRuns, 1);
		assert.strictEqual(dash.failedRuns, 1);
		assert.strictEqual(dash.successRate, 0.5);
		assert.strictEqual(dash.editSuccessRate, 1);
		assert.strictEqual(dash.stallRuns, 0);
	});

	test('aggregateMetricsDashboard tracks stalls and edit success rate', () => {
		const base = createRunMetricRecord('r1', 't1');
		const runs = [
			{
				...base,
				runId: 'r1',
				status: 'completed' as const,
				durationMs: 1000,
				toolCalls: 3,
				toolErrors: 0,
				successfulEdits: 1,
				editAttempts: 2,
				completionKind: 'partial' as const,
			},
			{
				...base,
				runId: 'r2',
				status: 'completed' as const,
				durationMs: 800,
				toolCalls: 1,
				toolErrors: 0,
				successfulEdits: 0,
				editAttempts: 0,
				planStall: true,
				completionKind: 'stalled' as const,
			},
		];
		const dash = aggregateMetricsDashboard(runs);
		assert.strictEqual(dash.editSuccessRate, 0.5);
		assert.strictEqual(dash.stallRuns, 1);
		assert.strictEqual(dash.completionKindCounts.length, 2);
	});

	test('buildRunMetricFromAssistantMessage counts tools', () => {
		const base = createRunMetricRecord('r1', 't1');
		const msg: ChatMessage = {
			id: 'a1',
			role: 'assistant',
			content: 'done',
			createdAt: Date.now(),
			toolCalls: [
				{ id: 'tc1', name: 'read_file', arguments: { path: 'a.ts' }, status: 'complete' },
				{ id: 'tc2', name: 'write_file', arguments: { path: 'b.ts' }, status: 'complete' },
			],
			toolResults: [
				{ toolCallId: 'tc1', content: 'ok', isError: false },
				{ toolCallId: 'tc2', content: 'ok', isError: false },
			],
		};
		const finished = buildRunMetricFromAssistantMessage(base, msg, 'fix bug', { status: 'completed' });
		assert.strictEqual(finished.toolCalls, 2);
		assert.strictEqual(finished.successfulEdits, 1);
		assert.ok((finished.durationMs ?? 0) >= 0);
	});
});
