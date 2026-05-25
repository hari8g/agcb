/*--------------------------------------------------------------------------------------
 *  Agentic AI — workspace rules (.voidrules / .cursorrules) for agent prompts
 *--------------------------------------------------------------------------------------*/

export const WORKSPACE_RULES_FILENAMES = ['.voidrules', '.cursorrules'] as const;

export function buildWorkspaceRulesPromptBlock(voidRules: string, cursorRules: string): string {
	const parts: string[] = [];
	if (voidRules.trim()) {
		parts.push(voidRules.trim());
	}
	if (cursorRules.trim() && cursorRules.trim() !== voidRules.trim()) {
		parts.push(cursorRules.trim());
	}
	if (!parts.length) {
		return '';
	}
	return ['<workspace_rules>', ...parts, '</workspace_rules>'].join('\n\n');
}

export function buildDynamicContextPromptBlock(): string {
	return [
		'<dynamic_context_discovery>',
		'Use dynamic context discovery: start with list_workspace, grep, and read_file on specific paths.',
		'Do not assume you have seen the full repository — pull only what each step needs.',
		'Prefer @mentioned paths and architecture_graph hints before broad file reads.',
		'</dynamic_context_discovery>',
	].join('\n');
}
