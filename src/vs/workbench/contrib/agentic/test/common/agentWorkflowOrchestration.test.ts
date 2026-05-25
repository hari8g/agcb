/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildWorkflowArtifacts,
	buildWorkflowOrchestrationPromptBlock,
	buildWorkflowImpact,
	runWorkflowPreflight,
	selectWorkflowPhases,
} from '../../common/agentWorkflowOrchestration.js';
import { classifyAgentIntent } from '../../common/agentIntentClassifier.js';
import { emptyCodeGraphContext } from '../../common/contextTypes.js';

suite('agentWorkflowOrchestration', () => {
	test('selectWorkflowPhases includes plan/analyse/impact for edit tasks', () => {
		const intent = classifyAgentIntent('create a package.json for this repository');
		const phases = selectWorkflowPhases({
			intent,
			complexity: 'complex',
			planOnlyMode: false,
		});
		assert.ok(phases.includes('plan'));
		assert.ok(phases.includes('analyse'));
		assert.ok(phases.includes('impact'));
		assert.ok(phases.includes('execute'));
	});

	test('selectWorkflowPhases is minimal for general chat', () => {
		const intent = classifyAgentIntent('hello');
		const phases = selectWorkflowPhases({
			intent,
			complexity: 'simple',
			planOnlyMode: false,
		});
		assert.deepStrictEqual(phases, ['intent_parse', 'classify', 'context_graph', 'execute']);
	});

	test('selectWorkflowPhases skips plan/impact for simple edit tasks', () => {
		const intent = classifyAgentIntent('Create package.json with name test-app');
		const phases = selectWorkflowPhases({
			intent,
			complexity: 'simple',
			planOnlyMode: false,
		});
		assert.deepStrictEqual(phases, ['intent_parse', 'classify', 'context_graph', 'execute', 'verify']);
		assert.ok(!phases.includes('impact'));
	});

	test('buildWorkflowOrchestrationPromptBlock includes plan and impact', () => {
		const userMessage = 'Refactor authentication across the monorepo and migrate services to OAuth2';
		const preflight = runWorkflowPreflight({
			userMessage,
			planOnlyMode: false,
			enableKnowledgeGraph: true,
			baseHistoryLimit: 40,
			baseSemanticMatches: 12,
			profile: 'pro',
		});
		assert.strictEqual(preflight.snapshot.complexity, 'complex');
		const context = {
			workspaceFolderUris: ['/tmp/proj'],
			userMessage,
			activeFilePath: '/tmp/proj/package.json',
			activeFileLanguageId: 'json',
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
		};
		const snapshot = buildWorkflowArtifacts({
			userMessage,
			intent: preflight.snapshot.intent,
			context,
			knowledgeGraph: null,
			planOnlyMode: false,
			snapshot: preflight.snapshot,
		});
		const block = buildWorkflowOrchestrationPromptBlock(snapshot);
		assert.ok(block.includes('<workflow_orchestration>'));
		assert.ok(block.includes('Execution plan'));
		assert.ok(block.includes('Impact assessment'));
		assert.ok(snapshot.plan && snapshot.plan.steps.length >= 2);
	});

	test('buildWorkflowImpact flags tests and imports', () => {
		const intent = classifyAgentIntent('fix auth in src/auth/service.ts');
		const analysis = {
			summary: 'test',
			relevantPaths: [
				{ path: 'src/auth/service.ts', role: 'service', reason: 'target' },
				{ path: 'src/auth/service.test.ts', role: 'test', reason: 'test' },
			],
			openQuestions: [],
			codebaseAreas: ['src/auth/'],
		};
		const impact = buildWorkflowImpact(intent, {
			workspaceFolderUris: [],
			userMessage: '',
			activeFilePath: 'src/auth/service.ts',
			activeFileLanguageId: 'typescript',
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
		}, null, analysis);
		assert.ok(impact.primaryTargets.some(p => p.includes('service.ts')));
		assert.ok(impact.affectedPaths.some(a => a.relation === 'test'));
	});
});
