/*--------------------------------------------------------------------------------------
 *  Agentic AI — natural-language activity narration
 *--------------------------------------------------------------------------------------*/

import type { CodebaseContext } from './contextTypes.js';

export function narrateUnderstanding(userMessage: string): string {
	const preview = userMessage.trim().slice(0, 80);
	return preview.length < userMessage.trim().length
		? `Let me understand what you need: “${preview}…”`
		: `Let me understand what you need: “${preview}”`;
}

export function narrateContextCollected(ctx: CodebaseContext): string[] {
	const lines: string[] = [];
	const folder = ctx.workspaceFolderUris[0];
	if (folder) {
		lines.push(`I’m looking at your workspace at ${folder.split('/').pop() ?? folder}.`);
	}
	if (ctx.gitBranch) {
		lines.push(`You’re on branch ${ctx.gitBranch}.`);
	}
	if (ctx.activeFilePath) {
		const name = ctx.activeFilePath.split('/').pop() ?? ctx.activeFilePath;
		lines.push(`I’ll keep ${name} in mind since it’s the file you have open.`);
	}
	if (ctx.selectedCode) {
		lines.push(`I’ve noted the code you selected in the editor.`);
	}
	if (ctx.openTabs.length > 1) {
		lines.push(`You have ${ctx.openTabs.length} tabs open—I can use those for context if needed.`);
	}
	if (ctx.codeGraph.semanticMatches.length) {
		lines.push(`I found ${ctx.codeGraph.semanticMatches.length} relevant snippet(s) in the codebase that might help.`);
	}
	if (lines.length === 0) {
		lines.push(`I’ve gathered context from the workspace.`);
	}
	return lines;
}

export function narrateModelThinking(turn: number, modelLabel?: string): string {
	if (turn === 0) {
		return modelLabel
			? `I’m thinking through your request using ${modelLabel}…`
			: `I’m thinking through your request…`;
	}
	return `I’m continuing to work on this (step ${turn + 1})…`;
}

export function narrateToolStart(name: string, args: Record<string, unknown>): string {
	switch (name) {
		case 'read_file':
			return `I’m reading ${basename(String(args.path ?? 'the file'))} to see what’s inside.`;
		case 'list_files':
		case 'list_workspace':
			return `I’m listing files in ${basename(String(args.path ?? '.'))} to orient myself.`;
		case 'search_files':
			return `I’m searching the project for files matching “${String(args.query ?? '')}”.`;
		case 'grep':
			return `I’m searching the codebase for “${String(args.pattern ?? '')}”.`;
		case 'get_symbols':
			return `I’m pulling out functions and classes from ${basename(String(args.path ?? 'the file'))}.`;
		case 'propose_file_edit':
			return `I’m drafting changes for ${basename(String(args.path ?? 'the file'))}—I’ll ask you to approve before applying.`;
		case 'apply_file_edit':
			return `I’m applying the approved edit to ${basename(String(args.path ?? 'the file'))}.`;
		case 'run_terminal_command':
			return `I need to run a terminal command: \`${String(args.command ?? '').slice(0, 120)}\``;
		case 'create_checkpoint':
			return `I’m saving a checkpoint so we can roll back if needed.`;
		default:
			if (/issue|jira|comment|transition/i.test(name)) {
				return `I'm calling JIRA via MCP (${name.replace(/_/g, ' ')})…`;
			}
			return `I’m running ${name.replace(/_/g, ' ')}…`;
	}
}

export function narrateToolDone(name: string, preview: string): string {
	const short = preview.replace(/\s+/g, ' ').slice(0, 160);
	switch (name) {
		case 'read_file':
			return short ? `Finished reading the file. ${short}` : `Finished reading the file.`;
		case 'grep':
		case 'search_files':
			return short ? `Search done. ${short}` : `Search complete.`;
		case 'propose_file_edit':
			return `Edit proposal ready for your review.`;
		default:
			return short ? `Done with ${name.replace(/_/g, ' ')}. ${short}` : `Done with ${name.replace(/_/g, ' ')}.`;
	}
}

export function narrateApproval(): string {
	return `I’m waiting for you to approve this step before I continue.`;
}

export function narrateComplete(): string {
	return `All set—I’ve finished this turn.`;
}

function basename(p: string): string {
	const parts = p.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] || p;
}
