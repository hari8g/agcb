/*---------------------------------------------------------------------------------------------
 *  Agentic AI — run completion tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	shouldAllowTextOnlyCompletion,
	shouldSkipVerifyNudge,
	recordSuccessfulFileEdit,
} from '../../common/agentRunCompletion.js';
import { createLoopProgressState } from '../../common/agentLoopBudget.js';
import { mustNotCompleteWithoutEdits } from '../../common/agentOrchestration.js';

suite('Agentic agentRunCompletion', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows text-only completion after write_file for create_file', () => {
		const state = createLoopProgressState();
		recordSuccessfulFileEdit(state, 'write_file', 'package.json');
		const user = 'Create package.json with name test-app and version 1.0.0';
		assert.strictEqual(
			shouldAllowTextOnlyCompletion(user, 'package.json has been created.', state),
			true,
		);
		assert.strictEqual(mustNotCompleteWithoutEdits(user, 'package.json has been created.', {
			successfulFileEditsInRun: state.successfulFileEditsInRun,
		}), false);
	});

	test('skips verify nudge for simple create_file after write', () => {
		const state = createLoopProgressState();
		recordSuccessfulFileEdit(state, 'write_file', 'package.json');
		const user = 'Create package.json with name test-app';
		assert.strictEqual(shouldSkipVerifyNudge(user, state), true);
	});
});
