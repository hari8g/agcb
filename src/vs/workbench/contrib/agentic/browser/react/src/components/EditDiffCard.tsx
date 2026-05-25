import React from 'react';
import type { ToolCall } from '../../../../common/agenticTypes.js';
import { summarizeSearchReplaceBlocks } from '../../../../common/editDiffPreview.js';
import { getChatService } from '../util/agenticServices.js';

function fileName(path: string): string {
	return path.split(/[/\\]/).pop() ?? path;
}

export function EditDiffCard({ toolCall }: { toolCall: ToolCall }) {
	if (toolCall.name !== 'propose_file_edit' && toolCall.name !== 'apply_file_edit') {
		return null;
	}
	const path = String(toolCall.arguments.path ?? '');
	const blocks = String(toolCall.arguments.searchReplaceBlocks ?? '');
	const summary = blocks.trim() ? summarizeSearchReplaceBlocks(blocks, 12) : null;
	const failed = toolCall.status === 'failed';
	const label = failed ? 'Edit attempted' : toolCall.status === 'complete' ? `Edit ${fileName(path)}` : `Editing ${fileName(path)}`;

	return (
		<div className={`agentic-edit-card${failed ? ' agentic-edit-card--failed' : ''}`}>
			<button
				type="button"
				className="agentic-edit-card__head"
				onClick={() => path && void getChatService().openTouchedFile(path)}
			>
				<span className="agentic-edit-card__label">{label}</span>
				{summary && (
					<span className="agentic-edit-card__stats">
						{summary.added > 0 && <span className="agentic-edit-card__add">+{summary.added}</span>}
						{summary.removed > 0 && <span className="agentic-edit-card__del">−{summary.removed}</span>}
					</span>
				)}
			</button>
			{summary && summary.lines.length > 0 && (
				<pre className="agentic-edit-card__diff">
					{summary.lines.map((line, i) => (
						<div
							key={i}
							className={`agentic-edit-card__line agentic-edit-card__line--${line.type}`}
						>
							{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
							{line.text}
						</div>
					))}
				</pre>
			)}
			{failed && toolCall.resultPreview && (
				<div className="agentic-edit-card__err">{toolCall.resultPreview.slice(0, 120)}</div>
			)}
		</div>
	);
}
