/*--------------------------------------------------------------------------------------
 *  Agentic AI — per-mode permissions tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildComposerModeSystemBlock,
	resolveApprovalOptionsForMode,
	shouldForcePlanOnlyForMode,
} from '../../common/agentModePermissions.js';
import { DEFAULT_AGENTIC_SETTINGS } from '../../common/agenticSettingsTypes.js';

suite('agentModePermissions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('plan mode forces plan-only and blocks auto-apply', () => {
		assert.strictEqual(shouldForcePlanOnlyForMode('plan'), true);
		const opts = resolveApprovalOptionsForMode(DEFAULT_AGENTIC_SETTINGS, { agentModeId: 'plan' });
		assert.strictEqual(opts.suggestedAutoApplyEdits, false);
		assert.strictEqual(opts.requireApprovalForEdits, true);
	});

	test('agent mode does not force plan-only', () => {
		assert.strictEqual(shouldForcePlanOnlyForMode('agent'), false);
	});

	test('agent mode with fast preset skips edit approval', () => {
		const opts = resolveApprovalOptionsForMode(
			{ ...DEFAULT_AGENTIC_SETTINGS, approvalMode: 'fast' },
			{ agentModeId: 'agent' },
		);
		assert.strictEqual(opts.requireApprovalForEdits, false);
		assert.strictEqual(opts.suggestedAutoApplyEdits, true);
	});

	test('debug mode enables read-only auto run', () => {
		const opts = resolveApprovalOptionsForMode(DEFAULT_AGENTIC_SETTINGS, { agentModeId: 'debug' });
		assert.strictEqual(opts.autoRunReadOnlyTools, true);
	});

	test('plan mode system block mentions write restrictions', () => {
		const block = buildComposerModeSystemBlock('plan');
		assert.ok(block.includes('Plan'));
		assert.ok(block.includes('propose_file_edit'));
	});
});
