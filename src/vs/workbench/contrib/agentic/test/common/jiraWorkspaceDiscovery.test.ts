/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { discoverLikelyFilesForTicket } from '../../common/mcp/jiraWorkspaceDiscovery.js';
import type { JiraTicket } from '../../common/mcp/jiraWorkflowTypes.js';

suite('jiraWorkspaceDiscovery', () => {
	test('discovers seller onboarding paths over package.json only', () => {
		const ticket: JiraTicket = {
			key: 'KAN-9',
			summary: 'Implement seller onboarding workflow with frontend, backend, validation, admin approval',
			description: 'seller onboarding admin review payout',
		};
		const paths = [
			'package.json',
			'frontend/package.json',
			'backend/app/models/seller.py',
			'backend/app/routes/seller_onboarding.py',
			'frontend/src/pages/seller/OnboardingPage.tsx',
			'backend/app/admin/seller_review.py',
		];
		const picked = discoverLikelyFilesForTicket(ticket, paths, { max: 10 });
		assert.ok(picked.some(p => /seller/i.test(p)));
		assert.ok(picked.some(p => /onboard/i.test(p) || /Onboarding/i.test(p)));
		assert.notStrictEqual(picked[0], 'package.json');
	});
});
