/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	configureAgenticDevConsole,
	isAgenticDevConsoleEnabled,
	logAgentEventToDevConsole,
} from '../../common/agenticDevConsole.js';

suite('agenticDevConsole', () => {
	teardown(() => {
		configureAgenticDevConsole({ enabled: false, verbose: false });
	});

	test('respects enabled flag', () => {
		configureAgenticDevConsole({ enabled: false });
		assert.strictEqual(isAgenticDevConsoleEnabled(), false);
		logAgentEventToDevConsole({
			type: 'run_started',
			runId: 'run-12345678',
			timestamp: 1,
			payload: {},
		});
		configureAgenticDevConsole({ enabled: true });
		assert.strictEqual(isAgenticDevConsoleEnabled(), true);
	});
});
