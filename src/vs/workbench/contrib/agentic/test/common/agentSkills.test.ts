/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { findAgentSkill } from '../../common/agentSkills.js';

suite('agentSkills', () => {
	test('findAgentSkill parses /plan', () => {
		const m = findAgentSkill('/plan Add User model to backend');
		assert.ok(m);
		assert.strictEqual(m!.skill.id, 'plan');
		assert.ok(m!.skill.planOnly);
		assert.ok(m!.remainder.includes('User model'));
	});
});
