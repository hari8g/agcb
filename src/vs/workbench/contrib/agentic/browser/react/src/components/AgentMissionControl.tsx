import React, { useState } from 'react';
import { useAgenticThreads, getChatService } from '../util/agenticServices.js';
import { buildMissionRows, type AgentMissionStatus } from '../../../../common/agentThreadStatus.js';

const STATUS_CLASS: Record<AgentMissionStatus, string> = {
	idle: 'agentic-mission__pill--idle',
	in_progress: 'agentic-mission__pill--progress',
	waiting_approval: 'agentic-mission__pill--approval',
	ready_for_review: 'agentic-mission__pill--ready',
	failed: 'agentic-mission__pill--failed',
};

export function AgentMissionControl() {
	const { threads, currentThreadId } = useAgenticThreads();
	const [open, setOpen] = useState(false);
	const chat = getChatService();
	const rows = buildMissionRows(threads);
	const active = rows.filter(r => r.status !== 'idle');
	const inProgress = active.filter(r => r.status === 'in_progress').length;
	const needsYou = active.filter(r => r.status === 'waiting_approval').length;
	const ready = active.filter(r => r.status === 'ready_for_review').length;

	if (!open) {
		return (
			<button
				type="button"
				className="agentic-btn agentic-btn--soft agentic-btn--sm agentic-mission-toggle"
				title="Agent runs"
				onClick={() => setOpen(true)}
			>
				<span className="agentic-mission-toggle__label">Runs</span>
				{inProgress > 0 && <span className="agentic-highlight-btn__count agentic-mission-toggle__badge">{inProgress}</span>}
				{needsYou > 0 && <span className="agentic-highlight-btn__count agentic-mission-toggle__badge agentic-mission-toggle__badge--warn">{needsYou}</span>}
			</button>
		);
	}

	return (
		<div className="agentic-mission-panel">
			<div className="agentic-mission-panel__head">
				<span className="agentic-mission-panel__title">Agent runs</span>
				<button type="button" className="agentic-btn agentic-btn--soft agentic-btn--sm" onClick={() => setOpen(false)}>
					Close
				</button>
			</div>
			<div className="agentic-mission-panel__stats">
				<span>{inProgress} in progress</span>
				<span>{needsYou} need approval</span>
				<span>{ready} ready for review</span>
			</div>
			<ul className="agentic-mission-panel__list">
				{rows.slice(0, 12).map(row => (
					<li key={row.threadId}>
						<button
							type="button"
							className={`agentic-mission-row${row.threadId === currentThreadId ? ' agentic-mission-row--active' : ''}`}
							onClick={() => {
								chat.switchThread(row.threadId);
								setOpen(false);
							}}
						>
							<div className="agentic-mission-row__top">
								<span className="agentic-mission-row__title">{row.title}</span>
								<span className={`agentic-mission__pill ${STATUS_CLASS[row.status]}`}>{row.statusLabel}</span>
							</div>
							{row.fileDelta && <span className="agentic-mission-row__delta">{row.fileDelta}</span>}
							{row.preview && <span className="agentic-mission-row__preview">{row.preview}</span>}
						</button>
					</li>
				))}
			</ul>
			<button type="button" className="agentic-btn agentic-btn-primary agentic-btn--sm agentic-mission-panel__new" onClick={() => chat.createThread()}>
				+ New run
			</button>
		</div>
	);
}
