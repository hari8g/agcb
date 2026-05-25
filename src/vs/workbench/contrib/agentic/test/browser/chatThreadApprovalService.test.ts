/*---------------------------------------------------------------------------------------------
 *  Agentic AI — approval service tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	cancelProposeEditsForApproval,
	finalizeProposeEditsForApproval,
	previewProposeEditTool,
	toolCallForApproval,
	type ChatThreadApprovalHost,
} from '../../browser/services/chatThreadApprovalService.js';
import type { ApprovalRequest, ChatMessage } from '../../common/agenticTypes.js';

function mockHost(): ChatThreadApprovalHost & { actions: string[] } {
	const actions: string[] = [];
	const host: ChatThreadApprovalHost & { actions: string[] } = {
		jiraWorkflowExecuting: false,
		actions,
		recordTouchedFile: (_m, path, status) => actions.push(`touch:${path}:${status}`),
		revealTouchedFileInEditor: path => actions.push(`reveal:${path}`),
		noteFileRevealed: () => actions.push('noted'),
		runPostEditLintVerify: () => { },
		recordJiraFileChange: () => { },
		writeFile: (path) => actions.push(`write:${path}`),
		finalizeProposeFileEdit: (path) => actions.push(`finalize:${path}`),
		cancelProposeFileEdit: path => actions.push(`cancel:${path}`),
		previewProposeFileEdit: path => actions.push(`preview:${path}`),
	};
	return host;
}

suite('chatThreadApprovalService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('toolCallForApproval finds by id', () => {
		const msg: ChatMessage = {
			id: 'a',
			role: 'assistant',
			content: '',
			createdAt: 0,
			toolCalls: [{ id: 'tc1', name: 'read_file', arguments: {}, status: 'complete' }],
		};
		assert.strictEqual(toolCallForApproval(msg, 'tc1')?.name, 'read_file');
		assert.strictEqual(toolCallForApproval(msg, 'missing'), undefined);
	});

	test('previewProposeEditTool records preview for valid blocks', () => {
		const host = mockHost();
		const msg: ChatMessage = { id: 'a', role: 'assistant', content: '', createdAt: 0 };
		previewProposeEditTool(host, msg, 'propose_file_edit', {
			path: 'a.ts',
			searchReplaceBlocks: '<<<<<<< ORIGINAL\nold\n=======\nnew\n>>>>>>> UPDATED',
		});
		assert.ok(host.actions.some(a => a.includes('touch:a.ts:preview')));
	});

	test('finalizeProposeEditsForApproval applies write_file on approve', () => {
		const host = mockHost();
		const msg: ChatMessage = {
			id: 'a',
			role: 'assistant',
			content: '',
			createdAt: 0,
			toolCalls: [{
				id: 'tc1',
				name: 'write_file',
				arguments: { path: 'pkg.json', content: '{}' },
				status: 'complete',
			}],
		};
		const ar: ApprovalRequest = {
			id: 'ap1',
			toolCallId: 'tc1',
			title: 'Edit',
			description: '',
			decision: 'pending',
			createdAt: 0,
		};
		finalizeProposeEditsForApproval(host, msg, ar);
		assert.ok(host.actions.some(a => a === 'write:pkg.json'));
	});

	test('cancelProposeEditsForApproval cancels propose_file_edit', () => {
		const host = mockHost();
		const msg: ChatMessage = {
			id: 'a',
			role: 'assistant',
			content: '',
			createdAt: 0,
			toolCalls: [{
				id: 'tc1',
				name: 'propose_file_edit',
				arguments: { path: 'b.ts', searchReplaceBlocks: 'x' },
				status: 'complete',
			}],
		};
		const ar: ApprovalRequest = {
			id: 'ap1',
			toolCallId: 'tc1',
			title: 'Edit',
			description: '',
			decision: 'pending',
			createdAt: 0,
		};
		cancelProposeEditsForApproval(host, msg, ar);
		assert.ok(host.actions.some(a => a === 'cancel:b.ts'));
		assert.ok(host.actions.some(a => a.includes('rejected')));
	});
});
