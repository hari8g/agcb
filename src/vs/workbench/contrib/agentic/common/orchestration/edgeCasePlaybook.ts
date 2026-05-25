/*--------------------------------------------------------------------------------------
 *  Agentic AI — edge-case playbook (centralized policies)
 *--------------------------------------------------------------------------------------*/

export type EdgeCaseKind =
	| 'plan_without_tools'
	| 'missing_file_patch'
	| 'invalid_edit_block'
	| 'context_overflow'
	| 'command_timeout'
	| 'approval_skipped'
	| 'verification_failure'
	| 'false_success_summary'
	| 'jira_moved_early'
	| 'mcp_unavailable'
	| 'duplicate_file_creation'
	| 'wrong_package_manager'
	| 'unsafe_terminal_command';

export type EdgeCaseAction =
	| 'nudge'
	| 'block'
	| 'retry'
	| 'stop'
	| 'warn';

export interface EdgeCasePolicy {
	kind: EdgeCaseKind;
	action: EdgeCaseAction;
	message: string;
}

export function resolveEdgeCase(kind: EdgeCaseKind, detail?: string): EdgeCasePolicy {
	const d = detail ? ` ${detail}` : '';
	switch (kind) {
		case 'plan_without_tools':
			return { kind, action: 'nudge', message: `Plan without tools detected.${d} Use read_file/list_files then write_file or propose_file_edit.` };
		case 'missing_file_patch':
			return { kind, action: 'nudge', message: `Target file missing.${d} Use write_file instead of propose_file_edit.` };
		case 'invalid_edit_block':
			return { kind, action: 'nudge', message: `Invalid searchReplaceBlocks.${d} Copy ORIGINAL lines verbatim from read_file.` };
		case 'context_overflow':
			return { kind, action: 'warn', message: `Context budget exceeded.${d} Use dynamic discovery and read_file for details.` };
		case 'command_timeout':
			return { kind, action: 'stop', message: `Terminal command timed out.${d} Try a shorter command or increase timeout.` };
		case 'approval_skipped':
			return { kind, action: 'block', message: `Write tool blocked until approval.${d}` };
		case 'verification_failure':
			return { kind, action: 'retry', message: `Verification failed.${d} One repair attempt allowed.` };
		case 'false_success_summary':
			return { kind, action: 'block', message: `Do not claim success.${d} Verification incomplete or failed.` };
		case 'jira_moved_early':
			return { kind, action: 'warn', message: `JIRA transition skipped.${d} Complete code changes and verify first.` };
		case 'mcp_unavailable':
			return { kind, action: 'warn', message: `MCP tool unavailable.${d} Continue with built-in tools or fix MCP config.` };
		case 'duplicate_file_creation':
			return { kind, action: 'nudge', message: `File already exists.${d} Use propose_file_edit or overwrite via write_file intentionally.` };
		case 'wrong_package_manager':
			return { kind, action: 'nudge', message: `Wrong package manager.${d} Check lockfile (npm/pnpm/yarn).` };
		case 'unsafe_terminal_command':
			return { kind, action: 'block', message: `Unsafe terminal command blocked.${d}` };
	}
}

export function mapToolErrorToEdgeCase(errorMessage: string): EdgeCaseKind | undefined {
	const e = errorMessage.toLowerCase();
	if (e.includes('searchreplaceblocks is empty') || e.includes('missing <<<<<<< original')) {
		return 'invalid_edit_block';
	}
	if (e.includes('file not found') || e.includes('does not exist')) {
		return 'missing_file_patch';
	}
	if (e.includes('blocked') && e.includes('approval')) {
		return 'approval_skipped';
	}
	if (e.includes('unsafe') && e.includes('command')) {
		return 'unsafe_terminal_command';
	}
	if (e.includes('timeout')) {
		return 'command_timeout';
	}
	if (e.includes('mcp') && (e.includes('unavailable') || e.includes('not connected'))) {
		return 'mcp_unavailable';
	}
	return undefined;
}
