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

	test('write_file skips approval when edits not gated', () => {
		const opts = { autoRunReadOnlyTools: true, requireApprovalForEdits: false };
		assert.strictEqual(
			requiresUserApproval('write_file', opts, getToolDefinition('write_file')),
			false,
		);
	});

	test('JIRA virtual read tools auto-run when read-only auto enabled', () => {
		const opts = { autoRunReadOnlyTools: true, requireApprovalForEdits: true, requireApprovalForMcpTools: true };
		assert.strictEqual(requiresUserApproval('fetch_jira_issue', opts), false);
		assert.strictEqual(canAutoExecute('fetch_jira_issue', opts), true);
	});

	test('MCP read heuristic skips approval when only writes gated', () => {
		const opts = {
			autoRunReadOnlyTools: true,
			requireApprovalForEdits: true,
			requireApprovalForMcpTools: false,
			requireApprovalForMcpWrites: true,
		};
		assert.strictEqual(requiresUserApproval('jira_search_issues', opts, undefined, true), false);
		assert.strictEqual(requiresUserApproval('jira_update_issue', opts, undefined, true), true);
	});
});
