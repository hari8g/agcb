/*---------------------------------------------------------------------------------------------
 *  Agentic AI — intent classifier tests
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { classifyAgentIntent } from '../../common/agentIntentClassifier.js';

suite('agentIntentClassifier', () => {
	test('improve with @ path', () => {
		const c = classifyAgentIntent('Improve @backend/app/models.py', {
			activeFilePath: 'fleet-management-platform/backend/app/models.py',
		});
		assert.strictEqual(c.intent, 'improve_code');
		assert.ok(c.confidence >= 0.7);
		assert.strictEqual(c.requiresEdits, true);
		assert.ok(c.targetPaths.length > 0);
	});

	test('execute approved plan', () => {
		const c = classifyAgentIntent('[Execute approved plan] Implement the plan');
		assert.strictEqual(c.intent, 'execute_plan');
		assert.strictEqual(c.requiresEdits, true);
	});

	test('explain without edit', () => {
		const c = classifyAgentIntent('/explain how does models.py work');
		assert.strictEqual(c.intent, 'explain_code');
		assert.strictEqual(c.requiresEdits, false);
	});

	test('chat only', () => {
		const c = classifyAgentIntent('thanks!');
		assert.strictEqual(c.intent, 'general_chat');
		assert.ok(c.confidence >= 0.9);
	});

	test('fix bug', () => {
		const c = classifyAgentIntent('fix the crash in models.py when saving');
		assert.ok(c.intent === 'fix_bug' || c.intent === 'edit_file');
		assert.strictEqual(c.requiresEdits, true);
	});

	test('jira', () => {
		const c = classifyAgentIntent('show open jira tickets');
		assert.strictEqual(c.intent, 'jira_workflow');
	});
});
