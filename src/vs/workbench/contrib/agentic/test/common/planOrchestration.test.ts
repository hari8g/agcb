/*--------------------------------------------------------------------------------------
 *  Agentic AI — plan-only stall detection tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	detectPlanOnlyStall,
	detectNonToolProgress,
	shouldNudgePlanContinuation,
	buildPlanContinuationNudge,
	isActionableAgentTask,
	planStallUserMessage,
	DEFAULT_ORCHESTRATOR_MAX_NUDGES,
	mustNotCompleteWithoutTools,
} from '../../common/planOrchestration.js';

suite('planOrchestration', () => {
	const userMsg = 'optimize my codebase for performance';

	test('detects plan-only optimization reply', () => {
		const plan = `To optimize your codebase, I will take the following systematic approach:

**Plan:**
1. List the files in your workspace
2. Search for performance anti-patterns

I will begin by listing all files.`;
		assert.strictEqual(detectPlanOnlyStall(plan, userMsg), true);
	});

	test('detects create-module plan without tools', () => {
		const plan = `I will create a new Python module realtime.py structured as follows:
- Define an interface class RealTimeDataProvider
- Offer methods to fetch real-time vehicle location
Let's proceed by creating this module.`;
		const user = 'Please create a new module for improving the real time data integration';
		assert.strictEqual(detectNonToolProgress(plan, user), true);
		assert.strictEqual(mustNotCompleteWithoutTools(user, plan), true);
	});

	test('detects deferred review without tools', () => {
		const deferred = `To enhance your page.js file, I need to know what features you want.

For now, I'll review the file and suggest concrete improvements after examining its structure.`;
		assert.strictEqual(detectPlanOnlyStall(deferred, 'improve page.js'), true);
	});

	test('does not stall when tool_call present', () => {
		const withTool = `Listing workspace.\n\`\`\`json\n{"tool_call":{"name":"list_workspace","arguments":{}}}\n\`\`\``;
		assert.strictEqual(detectPlanOnlyStall(withTool, userMsg), false);
	});

	test('shouldNudge respects max nudges', () => {
		const plan = '**Plan:**\n1. List files\n\nI will begin now.';
		assert.strictEqual(shouldNudgePlanContinuation({
			assistantText: plan,
			userMessage: userMsg,
			nudgesUsed: 0,
		}), true);
		assert.strictEqual(shouldNudgePlanContinuation({
			assistantText: plan,
			userMessage: userMsg,
			nudgesUsed: DEFAULT_ORCHESTRATOR_MAX_NUDGES,
		}), false);
	});

	test('buildPlanContinuationNudge mentions tools', () => {
		const nudge = buildPlanContinuationNudge('I will review the file next.', 'fix src/page.js');
		assert.ok(nudge.includes('tool_call'));
		assert.ok(nudge.includes('Orchestrator'));
		assert.ok(nudge.includes('read_file'));
	});

	test('planStallUserMessage explains no tools', () => {
		const msg = planStallUserMessage('For now I will review', 'improve page.js');
		assert.ok(msg.includes('tools') || msg.includes('Retry'));
	});

	test('isActionableAgentTask rejects thanks', () => {
		assert.strictEqual(isActionableAgentTask('thanks!'), false);
		assert.strictEqual(isActionableAgentTask('optimize the backend'), true);
	});
});
