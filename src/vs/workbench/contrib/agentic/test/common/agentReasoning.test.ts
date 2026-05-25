/*--------------------------------------------------------------------------------------
 *  Agentic AI — reasoning prompt and split tests
 *--------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	buildReasoningSystemPromptBlock,
	buildVerifyStepNudge,
	splitReasoningAndAnswer,
	toolNameToActivityKind,
	reasoningActivityLabel,
} from '../../common/agentReasoning.js';
import { resolveAgentCapabilities } from '../../common/agentCapabilities.js';
import { DEFAULT_AGENTIC_SETTINGS } from '../../common/agenticSettingsTypes.js';

suite('agentReasoning', () => {
	test('buildReasoningSystemPromptBlock includes observe-act loop', () => {
		const caps = resolveAgentCapabilities(DEFAULT_AGENTIC_SETTINGS);
		const block = buildReasoningSystemPromptBlock(caps);
		assert.ok(block.includes('Observe'));
		assert.ok(block.includes('tool_call'));
	});

	test('splitReasoningAndAnswer separates pre-tool text', () => {
		const text = 'I will read the config first.\n\n```json\n{"tool_call":{"name":"read_file","arguments":{"path":"a.ts"}}}\n```';
		const { reasoning, answer } = splitReasoningAndAnswer(text);
		assert.ok(reasoning.includes('read the config'));
		assert.strictEqual(answer, '');
	});

	test('toolNameToActivityKind maps read_file', () => {
		assert.strictEqual(toolNameToActivityKind('read_file'), 'reading');
		assert.strictEqual(toolNameToActivityKind('propose_file_edit'), 'editing');
	});

	test('buildVerifyStepNudge mentions paths', () => {
		const nudge = buildVerifyStepNudge([
			{ name: 'propose_file_edit', arguments: { path: 'src/page.js' } },
		]);
		assert.ok(nudge.includes('page.js'));
	});

	test('reasoningActivityLabel prefixes once', () => {
		assert.strictEqual(reasoningActivityLabel('Checking imports'), 'Reasoning: Checking imports');
		assert.strictEqual(reasoningActivityLabel('Reasoning: already'), 'Reasoning: already');
	});
});
