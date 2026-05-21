/*---------------------------------------------------------------------------------------------
 *  Agentic AI — message conversion tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { convertToRuntimeRequest, buildContextBlock } from '../../common/convertToLLMMessageService.js';
import { emptyCodeGraphContext } from '../../common/contextTypes.js';
import type { ChatThread } from '../../common/agenticTypes.js';
import { DEFAULT_AGENTIC_SETTINGS } from '../../common/agenticSettingsTypes.js';

suite('Agentic convertToLLMMessage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const baseThread = (): ChatThread => ({
		id: 't1',
		title: 'Test',
		createdAt: 1,
		updatedAt: 1,
		status: 'idle',
		messages: [
			{ id: 'u1', role: 'user', content: 'Hello', createdAt: 1 },
		],
		currentRunId: null,
		currentCheckpointId: null,
		liveStatus: null,
		approvalRequests: [],
		checkpoints: [],
		includeActiveFile: true,
		includeSelection: false,
		autoApplyEdits: false,
	});

	test('buildContextBlock includes workspace', () => {
		const block = buildContextBlock({
			workspaceFolderUris: ['/proj'],
			userMessage: 'fix bug',
			activeFilePath: '/proj/a.ts',
			activeFileLanguageId: 'typescript',
			activeFileContent: 'const x = 1;',
			selectedCode: null,
			selectionRange: null,
			openTabs: [],
			gitBranch: 'main',
			recentFiles: [],
			checkpointId: null,
			codeGraph: emptyCodeGraphContext(),
			jiraIssues: [],
			collectedAt: Date.now(),
		});
		assert.ok(block.includes('/proj'));
		assert.ok(block.includes('main'));
	});

	test('convertToRuntimeRequest includes system and user messages', () => {
		const req = convertToRuntimeRequest(
			baseThread(),
			{
				workspaceFolderUris: [],
				userMessage: 'hi',
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
			{ runtimeMode: 'local_provider', model: 'gpt-4o-mini', settings: DEFAULT_AGENTIC_SETTINGS },
			'run-1',
		);
		assert.strictEqual(req.runId, 'run-1');
		assert.ok(req.messages.some(m => m.role === 'system'));
		assert.ok(req.messages.some(m => m.content.includes('Hello')));
		assert.strictEqual(req.options.maxAgentTurns, DEFAULT_AGENTIC_SETTINGS.maxAgentTurns);
	});
});
