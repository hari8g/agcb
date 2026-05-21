/*---------------------------------------------------------------------------------------------
 *  Agentic AI — JIRA context extractor tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	buildJiraIssueToolParams,
	extractJiraIssueKeys,
	buildJiraContextBlock,
	findJiraGetIssueTool,
	mcpToolBaseName,
	parseIssueFromMcpText,
	resolveAtlassianCloudId,
} from '../../common/mcp/jiraContextExtractor.js';

suite('Agentic jiraContextExtractor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extractJiraIssueKeys', () => {
		const keys = extractJiraIssueKeys('Please fix PROJ-123 and MPS-9 today');
		assert.deepStrictEqual(keys.sort(), ['MPS-9', 'PROJ-123']);
	});

	test('buildJiraContextBlock', () => {
		const block = buildJiraContextBlock([{
			issueKey: 'PROJ-1',
			summary: 'Fix login',
			fetchedAt: Date.now(),
		}]);
		assert.ok(block.includes('PROJ-1'));
		assert.ok(block.includes('Fix login'));
	});

	test('mcpToolBaseName', () => {
		assert.strictEqual(mcpToolBaseName('551szc_getJiraIssue'), 'getJiraIssue');
	});

	test('findJiraGetIssueTool prefers getJiraIssue over teamwork graph', () => {
		const tools = [
			{ name: '551szc_getTeamworkGraphContext', description: 'Teamwork graph', serverName: 'atlassian', requiresApproval: true },
			{ name: '551szc_getJiraIssue', description: 'Get a JIRA issue by key', serverName: 'atlassian', requiresApproval: true },
		];
		const tool = findJiraGetIssueTool(tools);
		assert.ok(tool);
		assert.strictEqual(tool!.name, '551szc_getJiraIssue');
	});

	test('findJiraGetIssueTool falls back to teamwork graph when no getJiraIssue', () => {
		const tool = findJiraGetIssueTool([
			{ name: '551szc_getTeamworkGraphContext', description: 'Teamwork graph', serverName: 'atlassian', requiresApproval: true },
		]);
		assert.ok(tool);
		assert.strictEqual(tool!.name, '551szc_getTeamworkGraphContext');
	});

	test('buildJiraIssueToolParams teamwork graph', () => {
		const params = buildJiraIssueToolParams({
			name: 'x_getTeamworkGraphContext',
			description: '',
			serverName: 'atlassian',
			requiresApproval: false,
		}, 'KAN-4', { ATLASSIAN_SITE: 'https://harigs88.atlassian.net' });
		assert.strictEqual(params.objectType, 'JiraWorkItem');
		assert.strictEqual(params.objectIdentifier, 'KAN-4');
		assert.strictEqual(params.cloudId, 'https://harigs88.atlassian.net');
	});

	test('resolveAtlassianCloudId', () => {
		assert.strictEqual(resolveAtlassianCloudId({ ATLASSIAN_SITE: 'https://foo.atlassian.net/' }), 'https://foo.atlassian.net');
		assert.strictEqual(resolveAtlassianCloudId({ ATLASSIAN_SITE: 'foo.atlassian.net' }), 'https://foo.atlassian.net');
	});

	test('buildJiraIssueToolParams getJiraIssue uses cloudId and issueIdOrKey', () => {
		const params = buildJiraIssueToolParams({
			name: 'x_getJiraIssue',
			description: '',
			serverName: 'atlassian',
			requiresApproval: false,
			inputSchema: {
				type: 'object',
				properties: {
					cloudId: { type: 'string' },
					issueIdOrKey: { type: 'string' },
				},
				required: ['cloudId', 'issueIdOrKey'],
			},
		}, 'KAN-4', { ATLASSIAN_SITE: 'https://foo.atlassian.net' });
		assert.deepStrictEqual(params, {
			cloudId: 'https://foo.atlassian.net',
			issueIdOrKey: 'KAN-4',
		});
	});

	test('buildJiraIssueToolParams legacy issueKey-only schema', () => {
		const params = buildJiraIssueToolParams({
			name: 'x_getJiraIssue',
			description: '',
			serverName: 'atlassian',
			requiresApproval: false,
			inputSchema: { type: 'object', properties: { issueKey: { type: 'string' } } },
		}, 'KAN-4');
		assert.deepStrictEqual(params, { issueKey: 'KAN-4' });
	});

	test('parseIssueFromMcpText json', () => {
		const ctx = parseIssueFromMcpText(JSON.stringify({ summary: 'Hello', status: 'Open' }), 'X-1');
		assert.strictEqual(ctx.issueKey, 'X-1');
		assert.strictEqual(ctx.summary, 'Hello');
	});
});
