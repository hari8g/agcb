/*---------------------------------------------------------------------------------------------
 *  Agentic AI — JIRA chat intent tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { detectJiraChatIntent } from '../../common/mcp/jiraChatIntent.js';

suite('Agentic jiraChatIntent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects proceed with plan', () => {
		assert.strictEqual(detectJiraChatIntent('proceed with the plan')?.kind, 'accept_workflow');
	});

	test('short yes maps to accept when awaiting decision', () => {
		assert.strictEqual(
			detectJiraChatIntent('yes', { awaitingWorkflowDecision: true })?.kind,
			'accept_workflow',
		);
	});

	test('short no maps to decline when awaiting decision', () => {
		assert.strictEqual(
			detectJiraChatIntent('no', { awaitingWorkflowDecision: true })?.kind,
			'decline_workflow',
		);
	});
});
