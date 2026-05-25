import React, { useEffect, useRef } from 'react';
import type { JiraWorkflowEvent } from '../../agentic-bundle-types.js';

export function JiraWorkflowStream(props: { events: JiraWorkflowEvent[] }) {
	const endRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}, [props.events.length]);

	if (!props.events.length) {
		return null;
	}

	return (
		<section className="agentic-jira-section">
			<h3>Workflow log</h3>
			<ul className="agentic-jira-timeline agentic-jira-timeline--panel">
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
