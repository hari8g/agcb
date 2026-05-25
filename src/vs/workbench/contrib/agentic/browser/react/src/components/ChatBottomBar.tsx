import React, { useState } from 'react';
import type { ApprovalRequest } from '../../../../common/agenticTypes.js';
import { getChatService } from '../util/agenticServices.js';

function fileName(path: string): string {
	return path.split(/[/\\]/).pop() ?? path;
}

/** Cursor-style bottom bar: file count + Undo / Keep / Review above the composer. */
export function ChatBottomBar({
	requests,
}: {
	requests: ApprovalRequest[];
}) {
	const [filesOpen, setFilesOpen] = useState(false);
	const chat = getChatService();
	const pending = requests.filter(r => r.decision === 'pending');

	const fileItems = pending.flatMap(r =>
		(r.items?.length ? r.items : [{
			filePath: r.filePath,
			title: r.title,
			toolCallId: r.toolCallId,
		}]).map(item => ({
			path: item.filePath ?? '',
			approvalId: r.id,
		})),
	).filter(f => f.path);

	const uniquePaths = [...new Set(fileItems.map(f => f.path))];

	if (!pending.length) {
		return null;
	}

	const firstId = pending[0]?.id;

	return (
		<div className="agentic-bottom-bar" role="region" aria-label="Review changes">
			<button
				type="button"
				className="agentic-bottom-bar__files"
				onClick={() => setFilesOpen(o => !o)}
				aria-expanded={filesOpen}
			>
				<span className="agentic-bottom-bar__chevron">{filesOpen ? '▾' : '▸'}</span>
				{uniquePaths.length} file{uniquePaths.length === 1 ? '' : 's'}
			</button>
			<div className="agentic-bottom-bar__actions">
				<button
					type="button"
					className="agentic-btn agentic-btn--soft agentic-btn--sm"
					onClick={() => {
						for (const r of pending) {
							chat.rejectEdit(r.id);
						}
					}}
				>
					Undo all
				</button>
				<button
					type="button"
					className="agentic-btn agentic-btn--soft agentic-btn--sm"
					onClick={() => {
						for (const r of pending) {
							chat.approveEdit(r.id);
						}
					}}
				>
					Keep all
				</button>
				<button
					type="button"
					className="agentic-btn agentic-btn-primary agentic-btn--sm"
					onClick={() => firstId && chat.approveEdit(firstId)}
				>
					Review
				</button>
			</div>
			{filesOpen && (
				<ul className="agentic-bottom-bar__list">
					{uniquePaths.map(p => (
						<li key={p}>
							<button
								type="button"
								className="agentic-bottom-bar__file"
								onClick={() => void chat.openTouchedFile(p)}
							>
								{fileName(p)}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
