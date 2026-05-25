/*---------------------------------------------------------------------------------------------
 *  Agentic AI — JIRA ticket open/closed tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isJiraTicketOpen, partitionTicketsByOpen } from '../../common/mcp/jiraTicketStatus.js';

suite('Agentic jiraTicketStatus', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies open and closed by status', () => {
		assert.strictEqual(isJiraTicketOpen({ key: 'A-1', summary: 'x', status: 'In Progress' }), true);
		assert.strictEqual(isJiraTicketOpen({ key: 'A-2', summary: 'y', status: 'Done' }), false);
	});

	test('partitionTicketsByOpen', () => {
		const tickets = [
			{ key: 'A-1', summary: 'a', status: 'Open' },
			{ key: 'A-2', summary: 'b', status: 'Closed' },
		];
		const { open, closed } = partitionTicketsByOpen(tickets);
		assert.strictEqual(open.length, 1);
		assert.strictEqual(closed.length, 1);
	});
});
