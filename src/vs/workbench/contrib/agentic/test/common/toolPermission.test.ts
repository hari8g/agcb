/*---------------------------------------------------------------------------------------------
 *  Agentic AI — tool permission tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { classifyTool, canAutoExecute, requiresUserApproval } from '../../common/toolPermission.js';
import { getToolDefinition } from '../../common/toolTypes.js';

suite('Agentic toolPermission', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies read and write tools', () => {
		assert.strictEqual(classifyTool('read_file'), 'read_only');
		assert.strictEqual(classifyTool('run_terminal_command'), 'terminal');
		assert.strictEqual(classifyTool('propose_file_edit'), 'write');
	});

	test('auto-run read-only when enabled', () => {
		const opts = { autoRunReadOnlyTools: true, requireApprovalForEdits: true };
		assert.strictEqual(canAutoExecute('read_file', opts), true);
		assert.strictEqual(requiresUserApproval('read_file', opts, getToolDefinition('read_file')), false);
	});

	test('terminal always needs approval', () => {
		const opts = { autoRunReadOnlyTools: true, requireApprovalForEdits: false };
		assert.strictEqual(requiresUserApproval('run_terminal_command', opts), true);
	});
});
