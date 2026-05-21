import React, { useState } from 'react';

export function Composer({
	onSend,
	onStop,
	isRunning,
	includeActiveFile,
	includeSelection,
	autoApplyEdits,
	onToggleActiveFile,
	onToggleSelection,
	onToggleAutoApply,
	jiraWorkflowEnabled,
	onJiraListTickets,
}: {
	onSend: (text: string) => void;
	onStop: () => void;
	isRunning: boolean;
	includeActiveFile: boolean;
	includeSelection: boolean;
	autoApplyEdits: boolean;
	onToggleActiveFile: () => void;
	onToggleSelection: () => void;
	onToggleAutoApply: () => void;
	jiraWorkflowEnabled?: boolean;
	onJiraListTickets?: () => void;
}) {
	const [text, setText] = useState('');

	return (
		<div className="agentic-composer">
			<textarea
				value={text}
				onChange={e => setText(e.target.value)}
				placeholder="Ask about your codebase… (e.g. “show open JIRA tickets”)"
				onKeyDown={e => {
					if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						if (text.trim()) {
							onSend(text.trim());
							setText('');
						}
					}
				}}
			/>
			<div className="agentic-toggles">
				<label>
					<input type="checkbox" checked={includeActiveFile} onChange={onToggleActiveFile} />
					{' '}Include active file
				</label>
				<label>
					<input type="checkbox" checked={includeSelection} onChange={onToggleSelection} />
					{' '}Include selection
				</label>
				<label>
					<input type="checkbox" checked={autoApplyEdits} onChange={onToggleAutoApply} />
					{' '}Auto-apply edits
				</label>
			</div>
			{onJiraListTickets && (jiraWorkflowEnabled !== false) && (
				<div className="agentic-composer-jira">
					<span className="agentic-composer-jira__label">JIRA</span>
					<button
						type="button"
						className="agentic-btn agentic-btn-ghost agentic-btn--sm"
						disabled={isRunning}
						onClick={onJiraListTickets}
					>
						Show open tickets
					</button>
				</div>
			)}
			<div style={{ display: 'flex', gap: 8 }}>
				<button
					type="button"
					className="agentic-btn agentic-btn-primary"
					disabled={!text.trim() || isRunning}
					onClick={() => {
						onSend(text.trim());
						setText('');
					}}
				>
					Send
				</button>
				{isRunning && (
					<button type="button" className="agentic-btn" onClick={onStop}>Stop</button>
				)}
			</div>
		</div>
	);
}
