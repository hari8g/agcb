/*---------------------------------------------------------------------------------------------
 *  Agentic AI — JIRA tool registry tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	classifyJiraTicketIntent,
	listAvailableJiraVirtualTools,
	resolveMcpToolForVirtual,
	buildJiraToolRegistryPromptBlock,
} from '../../common/mcp/jiraToolRegistry.js';

suite('Agentic jiraToolRegistry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const twgTools = [
		{ name: 'x_getTeamworkGraphContext', description: 'graph', serverName: 'atlassian', requiresApproval: true },
	];

	test('fetch_jira_issue resolves teamwork graph backend', () => {
		const r = resolveMcpToolForVirtual('fetch_jira_issue', twgTools);
		assert.ok(r);
		assert.strictEqual(r!.virtual.name, 'fetch_jira_issue');
		assert.strictEqual(r!.mcp.name, 'x_getTeamworkGraphContext');
	});

	test('listAvailableJiraVirtualTools includes fetch when TWG present', () => {
		const list = listAvailableJiraVirtualTools(twgTools);
		assert.ok(list.some(t => t.name === 'fetch_jira_issue'));
	});

	test('classifyJiraTicketIntent bug', () => {
		const intent = classifyJiraTicketIntent({
			issueKey: 'KAN-4',
			summary: 'Fix login button crash',
			issueType: 'Bug',
			fetchedAt: Date.now(),
		});
		assert.strictEqual(intent, 'bug_fix');
	});

	test('buildJiraToolRegistryPromptBlock mentions fetch_jira_issue', () => {
		const block = buildJiraToolRegistryPromptBlock(twgTools);
		assert.ok(block.includes('fetch_jira_issue'));
		assert.ok(block.includes('jira_tool_registry'));
	});
});
