import React from 'react';
import type { LiveAgentStatus } from '../../../../common/agenticTypes.js';

const phaseLabel: Record<LiveAgentStatus['phase'], string> = {
	idle: 'Idle',
	parsing: 'Parse',
	collecting_context: 'Context',
	thinking: 'Think',
	streaming: 'Stream',
	tool: 'Tool',
	approval: 'Review',
	complete: 'Done',
	error: 'Error',
};

function phaseIcon(phase: LiveAgentStatus['phase']): string {
	switch (phase) {
		case 'streaming': return '✦';
		case 'tool': return '⚙';
		case 'approval': return '⏸';
		case 'complete': return '✓';
		case 'error': return '✗';
		case 'collecting_context': return '◎';
		case 'parsing': return '…';
		default: return '●';
	}
}

export function AgentStatusBar({
	status,
	isRunning,
}: {
	status: LiveAgentStatus | null;
	isRunning?: boolean;
}) {
	const display: LiveAgentStatus | null = status ?? (isRunning ? {
		phase: 'thinking',
		title: 'Working…',
		detail: 'Starting agent run',
		updatedAt: Date.now(),
	} : null);

	if (!display || display.phase === 'idle') {
		return null;
	}

	const isActive = !['complete', 'error'].includes(display.phase);

	return (
		<div
			className={`agentic-status-bar agentic-status-bar--${display.phase}`}
			role="status"
			aria-live="polite"
			aria-busy={isActive}
		>
			<div className="agentic-status-bar__row">
				<span className={`agentic-status-bar__icon${isActive ? ' agentic-status-bar__icon--pulse' : ''}`}>
					{phaseIcon(display.phase)}
				</span>
				<div className="agentic-status-bar__text">
					<div className="agentic-status-bar__title">{display.title}</div>
					{display.detail && (
						<div className="agentic-status-bar__detail">{display.detail}</div>
					)}
				</div>
				<span className="agentic-status-bar__phase">
					{display.workflowPhase
						? display.workflowPhase.replace(/_/g, ' ')
						: phaseLabel[display.phase]}
				</span>
			</div>
			{typeof display.progress === 'number' && isActive && (
				<div className="agentic-status-bar__progress-track">
					<div
						className="agentic-status-bar__progress-fill"
						style={{ width: `${Math.max(4, Math.min(100, display.progress))}%` }}
					/>
				</div>
			)}
		</div>
	);
}
