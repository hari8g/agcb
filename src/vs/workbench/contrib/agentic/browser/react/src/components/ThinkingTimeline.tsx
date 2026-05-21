import React, { useState } from 'react';
import type { AgentActivityKind, ThinkingEvent } from '../../../../common/agenticTypes.js';

const iconForStatus = (status: ThinkingEvent['status']) => {
	switch (status) {
		case 'complete': return '✓';
		case 'failed': return '✗';
		case 'running': return '…';
		default: return '○';
	}
};

const labelForKind = (kind?: AgentActivityKind): string => {
	switch (kind) {
		case 'reading': return 'Reading';
		case 'searching': return 'Searching';
		case 'planning': return 'Planning';
		case 'tool_call': return 'Tool';
		case 'editing': return 'Editing';
		case 'terminal': return 'Terminal';
		case 'approval': return 'Approval';
		case 'completed': return 'Done';
		default: return 'Activity';
	}
};

export function ThinkingTimeline({ events }: { events: ThinkingEvent[] }) {
	const [collapsed, setCollapsed] = useState(false);
	if (!events.length) return null;

	return (
		<div className="agentic-thinking">
			<button
				type="button"
				className="agentic-thinking-toggle"
				onClick={() => setCollapsed(c => !c)}
			>
				{collapsed ? '▸' : '▾'} Agent activity ({events.length})
			</button>
			{!collapsed && events.map(ev => (
				<div key={ev.id} className={`agentic-thinking-item agentic-thinking-${ev.kind ?? 'other'}`}>
					<span className="agentic-thinking-icon">{iconForStatus(ev.status)}</span>
					<div>
						<div>
							<span className="agentic-thinking-kind">{labelForKind(ev.kind)}</span>
							<strong>{ev.title}</strong>
						</div>
						{ev.description ? <div style={{ opacity: 0.75 }}>{ev.description}</div> : null}
					</div>
				</div>
			))}
		</div>
	);
}
