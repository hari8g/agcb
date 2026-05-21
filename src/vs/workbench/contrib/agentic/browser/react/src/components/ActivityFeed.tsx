import React, { useEffect, useRef } from 'react';
import type { ActivityLine, ChatMessage } from '../../../../common/agenticTypes.js';

/** Natural-language activity stream shown directly under the user’s message */
export function ActivityFeed({ message }: { message: ChatMessage }) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const lines = message.activityLines ?? [];
	const isActive = message.state && !['complete', 'error', 'idle'].includes(message.state);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [lines.length, lines[lines.length - 1]?.text]);

	if (!lines.length && !isActive) {
		return null;
	}

	return (
		<div className="agentic-activity-feed" aria-live="polite" aria-busy={isActive}>
			{lines.map(line => (
				<div
					key={line.id}
					className={`agentic-activity-line agentic-activity-line--${line.status}`}
				>
					<span className="agentic-activity-bullet" aria-hidden>›</span>
					<span className="agentic-activity-text">{line.text}</span>
					{line.status === 'streaming' && (
						<span className="agentic-activity-cursor" aria-hidden />
					)}
				</div>
			))}
			<div ref={bottomRef} />
		</div>
	);
}
