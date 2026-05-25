/*--------------------------------------------------------------------------------------
 *  Agentic AI — capability profiles tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildCapabilitiesSystemPromptBlock,
	resolveAgentCapabilities,
	getActiveCapabilityLabels,
} from '../../common/agentCapabilities.js';

suite('agentCapabilities', () => {
	test('pro profile enables parallel tools and plan/verify', () => {
		const caps = resolveAgentCapabilities({
			capabilityProfile: 'pro',
			capabilityOverrides: {},
			enableJiraWorkflow: true,
		});
		assert.strictEqual(caps.parallelToolCalls, true);
		assert.strictEqual(caps.planAndVerify, true);
		assert.ok(caps.historyMessageLimit >= 50);
	});

	test('standard disables parallel tools', () => {
		const caps = resolveAgentCapabilities({
			capabilityProfile: 'standard',
			capabilityOverrides: {},
			enableJiraWorkflow: true,
		});
		assert.strictEqual(caps.parallelToolCalls, false);
		assert.strictEqual(caps.terminalExecution, false);
		assert.strictEqual(caps.planAndVerify, true);
	});

	test('jiraWorkflow respects enableJiraWorkflow setting', () => {
		const off = resolveAgentCapabilities({
			capabilityProfile: 'pro',
			capabilityOverrides: {},
			enableJiraWorkflow: false,
		});
		assert.strictEqual(off.jiraWorkflow, false);
	});

	test('buildCapabilitiesSystemPromptBlock mentions parallel tools when enabled', () => {
		const caps = resolveAgentCapabilities({
			capabilityProfile: 'pro',
			capabilityOverrides: {},
			enableJiraWorkflow: true,
		});
		const block = buildCapabilitiesSystemPromptBlock(caps);
		assert.ok(block.includes('<agent_capabilities>'));
		assert.ok(block.includes('multiple tools'));
	});

	test('getActiveCapabilityLabels returns enabled labels', () => {
		const caps = resolveAgentCapabilities({
			capabilityProfile: 'standard',
			capabilityOverrides: {},
			enableJiraWorkflow: true,
		});
		const labels = getActiveCapabilityLabels(caps);
		assert.ok(labels.includes('Semantic codebase search'));
		assert.ok(!labels.includes('Terminal execution'));
	});
});
