/*--------------------------------------------------------------------------------------
 *  Agentic AI — composer agent modes (agent / plan / debug)
 *--------------------------------------------------------------------------------------*/

export type ComposerAgentModeId = 'agent' | 'plan' | 'debug';

export interface ComposerAgentModeDefinition {
	id: ComposerAgentModeId;
	label: string;
	shortLabel: string;
	description: string;
	agentRunMode?: 'default' | 'plan_only';
	/** Optional slash prefix applied when sending in this mode */
	sendPrefix?: string;
}

export const COMPOSER_AGENT_MODES: ComposerAgentModeDefinition[] = [
	{
		id: 'agent',
		label: 'Agent',
		shortLabel: 'Agent',
		description: 'Implement and edit with tools',
		agentRunMode: 'default',
	},
	{
		id: 'plan',
		label: 'Plan',
		shortLabel: 'Plan',
		description: 'Structured plan first — no edits until approved',
		agentRunMode: 'plan_only',
	},
	{
		id: 'debug',
		label: 'Debug',
		shortLabel: 'Debug',
		description: 'Diagnose and fix with evidence',
		agentRunMode: 'default',
		sendPrefix: '/fix ',
	},
];

export function getComposerAgentMode(id: ComposerAgentModeId | undefined): ComposerAgentModeDefinition {
	return COMPOSER_AGENT_MODES.find(m => m.id === id) ?? COMPOSER_AGENT_MODES[0];
}
