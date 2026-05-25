/*---------------------------------------------------------------------------------------------
 *  Agentic AI — execute-phase gating tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildExecuteGatedToolError,
	isExecutePhaseApproved,
	shouldGateExecutePhase,
	shouldOfferPlanExecuteDecision,
} from '../../common/executePhaseGating.js';
import { classifyAgentIntent } from '../../common/agentIntentClassifier.js';
import { runWorkflowPreflight } from '../../common/agentWorkflowOrchestration.js';

suite('Agentic executePhaseGating', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('execute approved via marker message', () => {
		assert.strictEqual(
			isExecutePhaseApproved({ userMessage: '[Execute approved plan] Implement it' }),
			true,
		);
	});

	test('gates complex edit workflows until approval', () => {
		const preflight = runWorkflowPreflight({
			userMessage: 'Refactor the authentication module across the monorepo and migrate to OAuth2',
			planOnlyMode: false,
			enableKnowledgeGraph: true,
			baseHistoryLimit: 40,
			baseSemanticMatches: 12,
			profile: 'pro',
		});
		assert.strictEqual(preflight.snapshot.complexity, 'complex');
		assert.ok(shouldGateExecutePhase({
			snapshot: preflight.snapshot,
			planOnlyMode: false,
			userMessage: 'Refactor the authentication module across the monorepo and migrate to OAuth2',
			executeApproved: false,
		}));
	});

	test('does not gate simple create-file tasks', () => {
		const preflight = runWorkflowPreflight({
			userMessage: 'Create package.json with name test-app and version 1.0.0',
			planOnlyMode: false,
			enableKnowledgeGraph: false,
			baseHistoryLimit: 40,
			baseSemanticMatches: 12,
			profile: 'standard',
		});
		assert.strictEqual(preflight.snapshot.complexity, 'simple');
		assert.strictEqual(shouldGateExecutePhase({
			snapshot: preflight.snapshot,
			planOnlyMode: false,
			userMessage: 'Create package.json with name test-app and version 1.0.0',
			executeApproved: false,
		}), false);
	});

	test('does not gate long scaffold app prompts', () => {
		const userMessage = [
			'Create a simple React todo app with package.json, vite.config.ts, src/main.tsx,',
			'src/App.tsx, and README. Use TypeScript.',
		].join(' ');
		const preflight = runWorkflowPreflight({
			userMessage,
			planOnlyMode: false,
			enableKnowledgeGraph: false,
			baseHistoryLimit: 40,
			baseSemanticMatches: 12,
			profile: 'standard',
		});
		assert.strictEqual(preflight.snapshot.complexity, 'simple');
		assert.strictEqual(preflight.snapshot.intent.intent, 'create_file');
		assert.strictEqual(shouldGateExecutePhase({
			snapshot: preflight.snapshot,
			planOnlyMode: false,
			userMessage,
			executeApproved: false,
		}), false);
	});

	test('does not gate routine complex implementation tasks', () => {
		const userMessage = 'Add a REST API endpoint for user profiles with validation and update the router file';
		const preflight = runWorkflowPreflight({
			userMessage,
			planOnlyMode: false,
			enableKnowledgeGraph: false,
			baseHistoryLimit: 40,
			baseSemanticMatches: 12,
			profile: 'standard',
		});
		assert.strictEqual(shouldGateExecutePhase({
			snapshot: preflight.snapshot,
			planOnlyMode: false,
			userMessage,
			executeApproved: false,
		}), false);
	});

	test('plan-only mode always gates', () => {
		const intent = classifyAgentIntent('Add a REST API for users');
		assert.strictEqual(shouldGateExecutePhase({
			planOnlyMode: true,
			userMessage: 'Add a REST API for users',
			executeApproved: false,
			snapshot: {
				phases: ['plan', 'execute'],
				completedPhases: [],
				currentPhase: 'plan',
				intent,
				complexity: 'simple',
				updatedAt: Date.now(),
			},
		}), true);
	});

	test('offers plan execute decision when gated and no writes', () => {
		assert.strictEqual(shouldOfferPlanExecuteDecision({
			executePhaseGated: true,
			planOnlyMode: false,
			toolsRan: true,
			writeToolsRan: false,
		}), true);
		assert.strictEqual(shouldOfferPlanExecuteDecision({
			executePhaseGated: true,
			planOnlyMode: false,
			toolsRan: true,
			writeToolsRan: true,
		}), false);
	});

	test('gated tool error mentions approval', () => {
		const err = buildExecuteGatedToolError('write_file');
		assert.ok(err.includes('write_file'));
		assert.ok(err.includes('Execute plan'));
	});
});
