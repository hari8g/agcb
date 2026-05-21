import React, { useEffect, useRef } from 'react';
import type { JiraWorkflowEvent } from '../../../../../common/mcp/jiraWorkflowTypes.js';

export function JiraWorkflowStream(props: { events: JiraWorkflowEvent[] }) {
	const endRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [props.events.length]);

	if (!props.events.length) {
		return (
			<section className="agentic-jira-section">
				<h3>Live stream</h3>
				<div className="agentic-jira-empty">Workflow events will appear here step by step.</div>
			</section>
		);
	}

	return (
		<section className="agentic-jira-section">
			<h3>Live stream</h3>
			<ul className="agentic-jira-timeline">
				{props.events.map(evt => (
					<li key={evt.id} className={`agentic-jira-timeline__item agentic-jira-timeline__item--${evt.level}`}>
						<span className="agentic-jira-timeline__dot" />
						<div className="agentic-jira-timeline__content">
							<div className="agentic-jira-timeline__msg">{evt.message}</div>
							<div className="agentic-jira-timeline__meta">
								{evt.ticketKey && <span>{evt.ticketKey}</span>}
								<span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
							</div>
						</div>
					</li>
				))}
				<div ref={endRef} />
			</ul>
		</section>
	);
}
