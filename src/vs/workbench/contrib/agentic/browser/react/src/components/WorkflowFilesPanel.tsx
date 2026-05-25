import React from 'react';
import type { ChatMessage, TouchedFile } from '../../../../common/agenticTypes.js';
import { getChatService } from '../util/agenticServices.js';

const STATUS_LABEL: Record<TouchedFile['status'], string> = {
	read: 'Read',
	preview: 'Editing',
	applied: 'Applied',
	rejected: 'Rejected',
	failed: 'Edit failed',
};

function fileName(path: string): string {
	const parts = path.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] || path;
}

/** Orchestration strip: files the agent read or changed this turn */
export function WorkflowFilesPanel({
	message,
	isLive,
}: {
	message: ChatMessage;
	isLive?: boolean;
}) {
	const files = [...(message.touchedFiles ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
	const isActive = isLive && message.state && !['complete', 'error'].includes(message.state);
	const show = isActive || files.length > 0;

	if (!show) {
		return null;
	}

	const hasEdits = files.some(f => f.status === 'preview' || f.status === 'applied');

	return (
		<div className={`agentic-workflow-files${isActive ? ' agentic-workflow-files--active' : ''}`}>
			<div className="agentic-workflow-files__head">
				<span className="agentic-workflow-files__badge">
					{isActive ? 'Workflow' : 'Files this turn'}
				</span>
				<span className="agentic-workflow-files__hint">
					{isActive
						? hasEdits
							? 'Edits open in the main editor — green/red highlights show live diffs.'
							: 'Files open in the editor as the agent reads them.'
						: 'Click a file to open it or review changes.'}
				</span>
			</div>
			{files.length > 0 ? (
				<ul className="agentic-workflow-files__list">
					{files.map(f => (
						<li key={f.path}>
							<button
								type="button"
								className="agentic-workflow-files__file"
								title={f.path}
								onClick={() => void getChatService().openTouchedFile(f.path, message.id)}
							>
								<span className="agentic-workflow-files__file-name">{fileName(f.path)}</span>
								<span className="agentic-workflow-files__file-path">{f.path}</span>
								<span className={`agentic-workflow-files__file-status agentic-workflow-files__file-status--${f.status}`}>
									{STATUS_LABEL[f.status]}
								</span>
							</button>
						</li>
					))}
				</ul>
			) : isActive ? (
				<p className="agentic-workflow-files__empty">Waiting for file reads or edits…</p>
			) : null}
		</div>
	);
}
