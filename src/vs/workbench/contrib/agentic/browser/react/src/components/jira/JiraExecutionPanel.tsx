import React from 'react';
import type { JiraChatMessageUi, JiraExecutionChangedFile } from '../../agentic-bundle-types.js';
import { getJiraWorkflowService } from '../../util/agenticServices.js';

const STATUS_LABEL: Record<JiraExecutionChangedFile['status'], string> = {
	opened: 'Opened',
	preview: 'Editing',
	applied: 'Applied',
};

function fileName(path: string): string {
	const parts = path.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] || path;
}

export function JiraExecutionPanel({ ui }: { ui: JiraChatMessageUi }) {
	const show =
		ui.executing
		|| ui.mode === 'executing'
		|| ui.mode === 'complete'
		|| ui.mode === 'stalled'
		|| ui.executionChangedFiles.length > 0;

	if (!show) {
		return null;
	}

	const files = [...ui.executionChangedFiles].sort((a, b) => b.updatedAt - a.updatedAt);
	const isRunning = ui.executing || ui.mode === 'executing';
	const sync = ui.jiraSyncResult;

	return (
		<div className={`agentic-jira-execution${isRunning ? ' agentic-jira-execution--active' : ''}`}>
			<div className="agentic-jira-execution__head">
				<span className="agentic-jira-execution__badge">{isRunning ? 'Execution mode' : 'Execution complete'}</span>
				<span className="agentic-jira-execution__hint">
					{isRunning
						? 'Changes open in the main editor — green/red highlights show live diffs.'
						: 'Files below were opened or edited during this run.'}
				</span>
			</div>
			{files.length > 0 ? (
				<ul className="agentic-jira-execution__files">
					{files.map(f => (
						<li key={f.path}>
							<button
								type="button"
								className="agentic-jira-execution__file"
								title={f.path}
								onClick={() => void getJiraWorkflowService().openExecutionFileInEditor(f.path)}
							>
								<span className="agentic-jira-execution__file-name">{fileName(f.path)}</span>
								<span className="agentic-jira-execution__file-path">{f.path}</span>
								<span className={`agentic-jira-execution__file-status agentic-jira-execution__file-status--${f.status}`}>
									{STATUS_LABEL[f.status]}
								</span>
							</button>
						</li>
					))}
				</ul>
			) : isRunning ? (
				<p className="agentic-jira-execution__empty">Waiting for file edits…</p>
			) : null}
			{sync && ui.mode === 'complete' && (
				<div className="agentic-jira-execution__sync">
					<div className="agentic-jira-execution__sync-title">JIRA sync</div>
					<ul className="agentic-jira-execution__sync-list">
						<li className={sync.commentAdded ? 'agentic-jira-execution__sync-ok' : 'agentic-jira-execution__sync-warn'}>
							{sync.commentAdded ? 'Comment posted' : 'Comment not posted'}
						</li>
						{sync.transitionAttempted && (
							<li className={sync.transitionOk ? 'agentic-jira-execution__sync-ok' : 'agentic-jira-execution__sync-warn'}>
								{sync.transitionOk
									? `Status → ${sync.transitionTarget ?? 'updated'}`
									: `Transition to "${sync.transitionTarget ?? 'target'}" failed`}
							</li>
						)}
						{sync.refreshedStatus && (
							<li className="agentic-jira-execution__sync-ok">
								Current status: <strong>{sync.refreshedStatus}</strong>
							</li>
						)}
					</ul>
					{sync.errors.length > 0 && (
						<ul className="agentic-jira-execution__sync-errors">
							{sync.errors.map((e, i) => (
								<li key={i}>{e}</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
