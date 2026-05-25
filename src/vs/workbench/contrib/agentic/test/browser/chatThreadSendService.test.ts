/*---------------------------------------------------------------------------------------------
 *  Agentic AI — send orchestrator tests
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DEFAULT_AGENTIC_SETTINGS } from '../../common/agenticSettingsTypes.js';
import { executeChatThreadSend, type ChatThreadSendHost } from '../../browser/services/chatThreadSendService.js';
import type { ChatThread } from '../../common/agenticTypes.js';
import { emptyCodeGraphContext } from '../../common/contextTypes.js';

function emptyThread(): ChatThread {
	return {
		id: 't1',
		title: 'Test',
		createdAt: 0,
		updatedAt: 0,
		status: 'idle',
		messages: [],
		approvalRequests: [],
		checkpoints: [],
		currentCheckpointId: null,
		currentRunId: null,
		liveStatus: null,
		includeActiveFile: true,
		includeSelection: true,
		autoApplyEdits: false,
	};
}

function minimalHost(thread: ChatThread | null): ChatThreadSendHost {
	const noop = () => { };
	const noopAsync = async () => undefined as never;
	return {
		suppressJiraChatIntent: true,
		settings: DEFAULT_AGENTIC_SETTINGS,
		getThread: () => thread,
		detectJiraChatIntent: () => null,
		isJiraAwaitingWorkflowDecision: () => false,
		handleJiraChatIntent: async () => { },
		recordExplicitUserMessage: noop,
		resolveMentionPaths: async paths => paths,
		loadMentionSnippets: async () => '',
		setLastFailedUserText: noop,
		setActiveRunId: noop,
		appendActivityLine: noop,
		completeActivityLine: noop,
		advanceWorkflowPhase: noop,
		setLiveStatus: noop,
		notify: noop,
		notifyImmediate: noop,
		getWorkspaceRulesBlock: async () => '',
		getSessionMemoryBlock: async () => '',
		getKnowledgeGraphCached: () => null,
		ensureKnowledgeGraphLoaded: async () => null,
		backgroundKnowledgeGraphBuild: noop,
		collectContext: async () => ({
			workspaceFolderUris: [],
			userMessage: '',
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
		}),
		beginRunMetrics: noop,
		startJiraWorkflow: noop,
		fetchJiraIssuesForMessage: async () => [],
		getJiraEnvDiagnosticsPrompt: noopAsync,
		getMcpTools: () => [],
		getMcpServerEnvs: async () => ({}),
		analyzeSymbolTargets: async () => null,
		readTargetFilesParallel: async () => [],
		isVoidChatDisabled: () => true,
		getVoidProviderConfig: () => undefined,
		startRuntimeRun: noop,
	};
}

suite('chatThreadSendService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('executeChatThreadSend returns noop without thread', async () => {
		const outcome = await executeChatThreadSend(minimalHost(null), 'hello');
		assert.strictEqual(outcome.kind, 'noop');
	});

	test('executeChatThreadSend returns noop for blank text', async () => {
		const outcome = await executeChatThreadSend(minimalHost(emptyThread()), '   ');
		assert.strictEqual(outcome.kind, 'noop');
	});
});
