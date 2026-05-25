/*---------------------------------------------------------------------------------------------
 *  Agentic AI — edit pipeline / tool router tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildToolRouterSystemBlock,
	prepareProposeFileEdit,
	routeEditToolCall,
	preferredEditToolForIntent,
} from '../../common/agentEditPipeline.js';
import { classifyAgentIntent } from '../../common/agentIntentClassifier.js';
import type { ParsedToolCall } from '../../common/toolCallParser.js';

suite('Agentic agentEditPipeline', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const ctx = (exists: Set<string>, userMessage: string) => ({
		workspaceRoot: '/ws',
		userMessage,
		pathExists: (p: string) => exists.has(p.trim()),
	});

	test('routes propose_file_edit to write_file for missing file', () => {
		const toolCall: ParsedToolCall = {
			name: 'propose_file_edit',
			arguments: {
				path: 'package.json',
				searchReplaceBlocks: `<<<<<<< ORIGINAL
=======
{
  "name": "test-app",
  "version": "1.0.0"
}
>>>>>>> UPDATED`,
			},
		};
		const routed = routeEditToolCall(
			toolCall,
			ctx(new Set(), 'Create package.json with name test-app and version 1.0.0'),
		);
		assert.strictEqual(routed.routed, true);
		assert.strictEqual(routed.toolCall.name, 'write_file');
		assert.strictEqual(routed.toolCall.arguments.path, 'package.json');
		assert.ok(String(routed.toolCall.arguments.content).includes('test-app'));
	});

	test('keeps propose_file_edit for existing file with valid blocks', () => {
		const blocks = `<<<<<<< ORIGINAL
const x = 1;
=======
const x = 2;
>>>>>>> UPDATED`;
		const toolCall: ParsedToolCall = {
			name: 'propose_file_edit',
			arguments: { path: 'src/a.ts', searchReplaceBlocks: blocks },
		};
		const routed = routeEditToolCall(
			toolCall,
			ctx(new Set(['src/a.ts']), 'Fix the bug in src/a.ts'),
		);
		assert.strictEqual(routed.toolCall.name, 'propose_file_edit');
		const validation = prepareProposeFileEdit(routed.toolCall, ctx(new Set(['src/a.ts']), 'Fix the bug'));
		assert.strictEqual(validation.validation.ok, true);
	});

	test('preferredEditToolForIntent favors write_file for create', () => {
		assert.strictEqual(preferredEditToolForIntent('create_file', false), 'write_file');
		assert.strictEqual(preferredEditToolForIntent('edit_file', true), 'propose_file_edit');
	});

	test('buildToolRouterSystemBlock includes intent and target', () => {
		const intent = classifyAgentIntent('Create package.json with name test-app');
		const block = buildToolRouterSystemBlock(intent);
		assert.ok(block.includes('<tool_router>'));
		assert.ok(block.includes('<tool_router>'));
		assert.ok(block.includes('package.json'));
		assert.ok(block.includes('write_file'));
	});
});
