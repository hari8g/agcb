/*--------------------------------------------------------------------------------------
 *  Agentic AI — progressive orchestration tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	detectNonToolProgress,
	detectPlanOnlyStall,
	pickBootstrapTool,
	shouldBootstrapProgress,
	shouldNudgePlanContinuation,
	shouldFailJiraExecution,
	buildEscalatingNudge,
	DEFAULT_ORCHESTRATOR_MAX_NUDGES,
} from '../../common/agentOrchestration.js';

suite('agentOrchestration', () => {
	const userMsg = 'improve page.js performance';

	test('detects deferred review as non-tool progress', () => {
		const text = `For now, I'll review page.js and suggest improvements after examining it.`;
		assert.strictEqual(detectNonToolProgress(text, userMsg), true);
	});

	test('detects empty model reply on coding task', () => {
		assert.strictEqual(detectNonToolProgress('', userMsg), true);
	});

	test('shouldBootstrap after max nudges', () => {
		assert.strictEqual(shouldBootstrapProgress({
			assistantText: 'I will begin by listing files.',
			userMessage: userMsg,
			nudgesUsed: DEFAULT_ORCHESTRATOR_MAX_NUDGES,
			bootstrapUsed: false,
		}), true);
	});

	test('shouldBootstrap on empty reply for coding task', () => {
		assert.strictEqual(shouldBootstrapProgress({
			assistantText: '',
			userMessage: userMsg,
			nudgesUsed: 0,
			bootstrapUsed: false,
		}), true);
	});

	test('pickBootstrapTool prefers read_file when path in message', () => {
		const t = pickBootstrapTool('fix src/page.js');
		assert.ok(t);
		assert.strictEqual(t!.name, 'read_file');
		assert.strictEqual(t!.arguments.path, 'src/page.js');
	});

	test('pickBootstrapTool uses active file over typo mention', () => {
		const t = pickBootstrapTool('@model.py improve', {
			activeFilePath: 'fleet-management-platform/backend/app/models.py',
			openTabs: [],
			codeGraph: { semanticMatches: [] } as never,
		});
		assert.ok(t);
		assert.strictEqual(t!.arguments.path, 'fleet-management-platform/backend/app/models.py');
	});

	test('pickBootstrapTool relativizes absolute active file to workspace', () => {
		const t = pickBootstrapTool('update package.json', {
			activeFilePath: '/Users/me/proj/package.json',
			workspaceFolderUris: ['/Users/me/proj'],
			openTabs: [],
			codeGraph: { semanticMatches: [] } as never,
		});
		assert.ok(t);
		assert.strictEqual(t!.name, 'read_file');
		assert.strictEqual(t!.arguments.path, 'package.json');
	});

	test('escalating nudge gets stricter', () => {
		const mild = buildEscalatingNudge(0, '1. List files', userMsg);
		const strict = buildEscalatingNudge(4, '1. List files', userMsg);
		assert.ok(mild.includes('Orchestrator'));
		assert.ok(strict.includes('final') || strict.includes('MUST'));
	});

	test('does not nudge when tools present', () => {
		const withTool = '```json\n{"tool_call":{"name":"read_file","arguments":{"path":"a.ts"}}}\n```';
		assert.strictEqual(shouldNudgePlanContinuation({
			assistantText: withTool,
			userMessage: userMsg,
			nudgesUsed: 0,
		}), false);
		assert.strictEqual(detectPlanOnlyStall(withTool, userMsg), false);
	});

	test('JIRA execution keeps nudging after read_file', () => {
		const jiraMsg = '[JIRA EXECUTION] KAN-9: implement seller onboarding';
		const prose = 'I will review the seller module and implement onboarding next.';
		assert.strictEqual(shouldNudgePlanContinuation({
			assistantText: prose,
			userMessage: jiraMsg,
			nudgesUsed: 0,
			bootstrapReadDelivered: true,
			jiraExecution: true,
		}), true);
	});

	test('shouldFailJiraExecution allows exploration after one read', () => {
		assert.strictEqual(shouldFailJiraExecution({
			consecutiveNoToolTurns: 3,
			toolsExecutedInRun: 1,
			successfulFileEditsInRun: 0,
		}), false);
		assert.strictEqual(shouldFailJiraExecution({
			consecutiveNoToolTurns: 3,
			toolsExecutedInRun: 0,
			successfulFileEditsInRun: 0,
		}), true);
	});
});
