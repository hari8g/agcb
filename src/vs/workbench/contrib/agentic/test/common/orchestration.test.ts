/*--------------------------------------------------------------------------------------
 *  Agentic AI — orchestration layer tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { classifyStructuredIntent } from '../../common/orchestration/structuredIntent.js';
import { routeToolForIntent } from '../../common/orchestration/intentToolRouter.js';
import { runOrchestrationPreflight } from '../../common/orchestration/workflowOrchestrator.js';
import { checkTerminalCommandSafety } from '../../electron-main/runtime/terminalSafety.js';
import { bootstrapCanonicalSnapshotAfterPreflight } from '../../common/orchestration/canonicalWorkflowTracker.js';
import { recordLintVerificationResult } from '../../common/orchestration/verificationAdapter.js';
import type { ChatThread } from '../../common/agenticTypes.js';
import { emptyCodeGraphContext } from '../../common/contextTypes.js';
import { DEFAULT_AGENTIC_SETTINGS } from '../../common/agenticSettingsTypes.js';
import { resolveAgentCapabilities } from '../../common/agentCapabilities.js';
import { selectAgentPipelineStrategy } from '../../common/agentPipeline.js';

suite('agentic orchestration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifyStructuredIntent maps create app to create_file', () => {
		const si = classifyStructuredIntent('Create package.json with name test-app and version 1.0.0');
		assert.strictEqual(si.intent, 'create_file');
		assert.strictEqual(si.complexity, 'simple');
		assert.ok(si.explicitPaths.some(p => p.includes('package.json')));
	});

	test('routeToolForIntent blocks writes for answer_question', () => {
		const intent = classifyStructuredIntent('Explain how auth works');
		const decision = routeToolForIntent(
			{ name: 'write_file', arguments: { path: 'a.ts', content: 'x' } },
			intent,
			{ workspaceRoot: '/tmp', userMessage: 'Explain', pathExists: () => false },
		);
		assert.strictEqual(decision.action, 'block');
	});

	test('runOrchestrationPreflight produces run plan', () => {
		const caps = resolveAgentCapabilities(DEFAULT_AGENTIC_SETTINGS);
		const pipeline = selectAgentPipelineStrategy('Create package.json', {
			enableKnowledgeGraph: true,
			baseHistoryLimit: 40,
			baseSemanticMatches: 10,
			profile: 'pro',
		});
		const result = runOrchestrationPreflight({
			runId: 'run-1',
			userMessage: 'Create package.json with name test-app',
			planOnlyMode: false,
			executeApproved: false,
			settings: DEFAULT_AGENTIC_SETTINGS,
			caps,
			context: {
				workspaceFolderUris: ['/tmp/ws'],
				userMessage: 'Create package.json',
				activeFilePath: null,
				activeFileLanguageId: null,
				activeFileContent: null,
				selectedCode: null,
				selectionRange: null,
				openTabs: [],
				gitBranch: null,
				recentFiles: [],
				checkpointId: null,
				codeGraph: emptyCodeGraphContext(),
				jiraIssues: [],
				collectedAt: Date.now(),
			},
			knowledgeGraph: null,
			pipeline,
			includeActiveFile: true,
			includeSelection: true,
		});
		assert.strictEqual(result.workflowRunPlan.runId, 'run-1');
		assert.ok(result.canonicalPhases.includes('execute'));
		assert.ok(result.promptBlocks.structuredIntent.includes('structured_intent'));
	});

	test('terminalSafety blocks destructive commands', () => {
		const blocked = checkTerminalCommandSafety('rm -rf /');
		assert.strictEqual(blocked.allowed, false);
		const ok = checkTerminalCommandSafety('npm test');
		assert.strictEqual(ok.allowed, true);
	});

	test('bootstrapCanonicalSnapshotAfterPreflight marks preflight phases', () => {
		const snap = bootstrapCanonicalSnapshotAfterPreflight(
			['understand', 'classify', 'collect_context', 'execute', 'verify', 'repair_once', 'summarize'],
			{ hasPlan: false, hasImpact: false },
		);
		assert.ok(snap.completedPhases.includes('collect_context'));
		assert.strictEqual(snap.currentPhase, 'execute');
	});

	test('recordLintVerificationResult repair_once then stop', () => {
		const thread: ChatThread = {
			id: 't1',
			title: 'test',
			messages: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			status: 'running',
			approvalRequests: [],
			checkpoints: [],
			currentCheckpointId: null,
			currentRunId: 'run-1',
			liveStatus: null,
			includeActiveFile: true,
			includeSelection: true,
			autoApplyEdits: false,
			canonicalWorkflowSnapshot: bootstrapCanonicalSnapshotAfterPreflight(
				['execute', 'verify', 'repair_once', 'summarize'],
			),
		};
		const fail = recordLintVerificationResult(thread, 'src/a.ts', 'Error: bad', true);
		assert.ok(fail.injectMessage?.includes('repair_once'));
		assert.strictEqual(thread.verificationState?.repairAttempted, true);
		const failAgain = recordLintVerificationResult(thread, 'src/a.ts', 'Error: still bad', true);
		assert.strictEqual(failAgain.injectMessage, undefined);
		const pass = recordLintVerificationResult(thread, 'src/a.ts', '', false);
		assert.strictEqual(pass.injectMessage, undefined);
		assert.strictEqual(thread.verificationState?.status, 'passed');
	});
});
