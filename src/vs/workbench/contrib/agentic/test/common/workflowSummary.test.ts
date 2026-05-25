/*--------------------------------------------------------------------------------------
 *  Agentic AI — workflow completion summary tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildWorkflowCompletionSummary,
	formatWorkflowSummaryMarkdown,
	shouldPrependSummaryToContent,
} from '../../common/workflowSummary.js';
import type { ChatMessage } from '../../common/agenticTypes.js';

suite('workflowSummary', () => {
	test('builds summary with asked, approach, actions, outcome', () => {
		const assistant: ChatMessage = {
			id: 'a1',
			role: 'assistant',
			content: 'Updated page.js with validation.',
			createdAt: Date.now(),
			state: 'complete',
			activityLines: [
				{ id: '1', text: 'Reasoning: I will read the file first.', status: 'complete', timestamp: 1, kind: 'reasoning' },
			],
			toolCalls: [
				{
					id: 't1',
					name: 'read_file',
					arguments: { path: 'src/page.js' },
					status: 'complete',
					resultPreview: 'file contents...',
				},
				{
					id: 't2',
					name: 'propose_file_edit',
					arguments: { path: 'src/page.js' },
					status: 'complete',
				},
			],
			touchedFiles: [{ path: 'src/page.js', status: 'applied', updatedAt: 1 }],
		};
		const summary = buildWorkflowCompletionSummary({
			userMessage: 'Improve page.js',
			assistantMessage: assistant,
		});
		assert.strictEqual(summary.asked, 'Improve page.js');
		assert.ok(summary.approach.some(s => /read/i.test(s)));
		assert.strictEqual(summary.actions.length, 2);
		assert.ok(summary.outcome.includes('page.js'));
		assert.strictEqual(summary.completionKind, 'success');
	});

	test('formatWorkflowSummaryMarkdown includes sections', () => {
		const summary = buildWorkflowCompletionSummary({
			userMessage: 'fix bug',
			assistantMessage: {
				id: 'a',
				role: 'assistant',
				content: 'done',
				createdAt: 0,
				toolCalls: [{ id: 't', name: 'grep', arguments: { pattern: 'foo' }, status: 'complete' }],
			},
		});
		const md = formatWorkflowSummaryMarkdown(summary);
		assert.ok(md.includes('### What you asked'));
		assert.ok(md.includes('### How I approached it'));
		assert.ok(md.includes('### What I did'));
		assert.ok(md.includes('### Result'));
	});

	test('shouldPrependSummaryToContent when answer is short and tools ran', () => {
		const summary = buildWorkflowCompletionSummary({
			userMessage: 'do work',
			assistantMessage: {
				id: 'a',
				role: 'assistant',
				content: 'ok',
				createdAt: 0,
				toolCalls: [{ id: 't', name: 'read_file', arguments: { path: 'a.ts' }, status: 'complete' }],
			},
		});
		assert.strictEqual(shouldPrependSummaryToContent(summary, 'ok'), true);
	});
});
