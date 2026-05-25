/*--------------------------------------------------------------------------------------
 *  Agentic AI — slash skills (Cursor-style /commands)
 *--------------------------------------------------------------------------------------*/

export interface AgentSkill {
	id: string;
	slash: string;
	label: string;
	description: string;
	/** Prepended to the user message when this skill is invoked */
	promptPrefix: string;
	/** Optional system addendum for this run */
	systemAddendum?: string;
	planOnly?: boolean;
}

export const AGENT_SKILLS: AgentSkill[] = [
	{
		id: 'plan',
		slash: '/plan',
		label: 'Plan',
		description: 'Clarify requirements, outline steps, then wait for approval before editing',
		planOnly: true,
		promptPrefix: '[Plan mode] Create an implementation plan only — do not edit files yet.',
		systemAddendum: `PLAN MODE: Do not call propose_file_edit or run_terminal_command.
Output: (1) understanding, (2) open questions if any, (3) numbered steps, (4) files to touch, (5) validation commands.
End with a short "Ready to execute" section. Wait for the user to approve before making changes.`,
	},
	{
		id: 'review',
		slash: '/review',
		label: 'Code review',
		description: 'Analyze code for bugs, security, and style — suggest fixes',
		promptPrefix: '[Code review] Review the relevant code thoroughly.',
		systemAddendum: 'Focus on correctness, edge cases, security, performance, and consistency with the repo. Use read_file/grep before judging. Propose concrete fixes via propose_file_edit when appropriate.',
	},
	{
		id: 'test',
		slash: '/test',
		label: 'Tests',
		description: 'Generate or run tests for the selected area',
		promptPrefix: '[Test mode] Add or improve tests for the requested code.',
		systemAddendum: 'Locate existing test patterns in the repo first. Prefer minimal focused tests. Run tests via run_terminal_command when a test command is known.',
	},
	{
		id: 'fix',
		slash: '/fix',
		label: 'Fix',
		description: 'Debug and fix a specific issue with evidence',
		promptPrefix: '[Fix mode] Diagnose and fix the reported issue.',
		systemAddendum: 'Reproduce mentally from code, read relevant files, form a hypothesis, then apply a minimal fix. Verify with tests or grep if possible.',
	},
	{
		id: 'refactor',
		slash: '/refactor',
		label: 'Refactor',
		description: 'Improve structure without changing behavior',
		promptPrefix: '[Refactor mode] Refactor for clarity and maintainability.',
		systemAddendum: 'Preserve behavior. Prefer small incremental edits. Run tests if available after changes.',
	},
	{
		id: 'explain',
		slash: '/explain',
		label: 'Explain',
		description: 'Explain how code works — read-only',
		promptPrefix: '[Explain mode] Explain without modifying files.',
		systemAddendum: 'Read-only: do not call propose_file_edit or run_terminal_command unless the user explicitly asks to run something.',
	},
];

export function findAgentSkill(input: string): { skill: AgentSkill; remainder: string } | null {
	const trimmed = input.trim();
	for (const skill of AGENT_SKILLS) {
		if (trimmed.toLowerCase().startsWith(skill.slash.toLowerCase())) {
			const remainder = trimmed.slice(skill.slash.length).trim();
			return { skill, remainder };
		}
	}
	return null;
}

export function listAgentSkills(): AgentSkill[] {
	return [...AGENT_SKILLS];
}
