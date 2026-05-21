import React from 'react';
import type { JiraWorkflowCheckpoint } from '../../../../../common/mcp/jiraWorkflowTypes.js';

export function JiraWorkflowCheckpoints(props: {
	checkpoints: JiraWorkflowCheckpoint[];
	onRestore: (id: string) => void;
}) {
	const { checkpoints, onRestore } = props;
	const sorted = [...checkpoints].reverse().slice(0, 20);

	return (
		<section className="agentic-jira-section">
			<h3>Checkpoints</h3>
			{!sorted.length && (
				<div className="agentic-jira-empty">Checkpoints are created at each major workflow stage.</div>
			)}
			<ul className="agentic-jira-checkpoints">
				{sorted.map(cp => (
					<li key={cp.id} className="agentic-jira-checkpoint-item">
						<div className="agentic-jira-checkpoint-item__head">
							<span className="agentic-pill agentic-pill--muted">{cp.stage}</span>
							<span className="agentic-jira-checkpoint-item__time">
								{new Date(cp.timestamp).toLocaleString()}
							</span>
						</div>
						<div className="agentic-jira-checkpoint-item__summary">{cp.summary}</div>
						<div className="agentic-jira-checkpoint-item__key">{cp.ticketKey}</div>
						<button
							type="button"
							className="agentic-btn agentic-btn-ghost agentic-btn--sm"
							onClick={() => onRestore(cp.id)}
						>
							Inspect
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
