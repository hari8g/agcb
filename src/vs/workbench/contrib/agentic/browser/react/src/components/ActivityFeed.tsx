import React from 'react';
import type { ChatMessage } from '../../../../common/agenticTypes.js';
import { shouldShowActivityLine } from '../util/activityFilters.js';

/** Orchestrator-only notices (tools use ToolStream). */
export function ActivityFeed({ message }: { message: ChatMessage }) {
	const lines = (message.activityLines ?? []).filter(shouldShowActivityLine);
	if (!lines.length) {
		return null;
	}

	return (
		<div className="agentic-chat-activity" aria-live="polite">
			{lines.map(line => (
				<div
					key={line.id}
					className={`agentic-chat-activity__line agentic-chat-activity__line--${line.kind ?? 'status'}`}
				>
					{line.text}
				</div>
			))}
		</div>
	);
}
