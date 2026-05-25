import React from 'react';
import type { ChatMessage, ToolCall } from '../../../../common/agenticTypes.js';

function chipLabel(tc: ToolCall): string {
	const path = String(tc.arguments.path ?? '');
	const base = path.split(/[/\\]/).pop() ?? '';
	switch (tc.name) {
		case 'read_file':
			return base ? `Read ${base}` : 'Read file';
		case 'propose_file_edit':
			return base ? `Edit ${base}` : 'Propose edit';
		case 'apply_file_edit':
			return base ? `Apply ${base}` : 'Apply edit';
		case 'grep':
			return `Grep`;
		case 'list_files':
		case 'list_workspace':
			return 'Explore';
		case 'run_terminal_command':
			return 'Terminal';
		default:
			return tc.name.replace(/_/g, ' ');
	}
}

/** Compact Cursor-style tool chips (live updates from toolCalls). */
export function ToolStream({
	message,
	isLive,
}: {
	message: ChatMessage;
	isLive?: boolean;
}) {
	const tools = message.toolCalls ?? [];
	if (!tools.length) {
		return null;
	}

	const seen = new Set<string>();
	const chips: ToolCall[] = [];
	for (let i = tools.length - 1; i >= 0; i--) {
		const tc = tools[i]!;
		const key = `${tc.name}:${String(tc.arguments.path ?? '')}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		chips.unshift(tc);
	}

	return (
		<div className={`agentic-tool-stream${isLive ? ' agentic-tool-stream--live' : ''}`} aria-live="polite">
			{chips.map(tc => (
				<span
					key={tc.id}
					className={`agentic-tool-stream__chip agentic-tool-stream__chip--${tc.status ?? 'running'}`}
					title={tc.resultPreview?.slice(0, 200) ?? chipLabel(tc)}
				>
					{chipLabel(tc)}
				</span>
			))}
		</div>
	);
}
