import React, { useState } from 'react';
import type { Checkpoint } from '../../../../common/agenticTypes.js';
import { getChatService } from '../util/agenticServices.js';

function basename(path: string): string {
	const parts = path.split(/[/\\]/);
	return parts[parts.length - 1] || path;
}

export function CheckpointsPanel(props: {
	checkpoints: Checkpoint[];
	isRunning: boolean;
}) {
	const { checkpoints, isRunning } = props;
	const [restoringId, setRestoringId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [lastMessage, setLastMessage] = useState<string | null>(null);

	const sorted = [...checkpoints].reverse().slice(0, 12);
	if (!sorted.length) {
		return null;
	}

	const onRestore = async (id: string) => {
		setRestoringId(id);
		setLastMessage(null);
		try {
			const result = await getChatService().restoreCheckpoint(id);
			setLastMessage(result.ok ? result.message : result.message);
		} catch (e) {
			setLastMessage(e instanceof Error ? e.message : String(e));
		} finally {
			setRestoringId(null);
		}
	};

	const onSave = async () => {
		setSaving(true);
		setLastMessage(null);
		try {
			const result = await getChatService().createManualCheckpoint();
			setLastMessage(result.message);
		} catch (e) {
			setLastMessage(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	};

	return (
		<section className="agentic-checkpoints agentic-checkpoints--glass" aria-label="Agent checkpoints">
			<div className="agentic-checkpoints__head">
				<div className="agentic-checkpoints__title-row">
					<strong>Checkpoints</strong>
					<span className="agentic-checkpoints__count">{sorted.length}</span>
				</div>
				<button
					type="button"
					className="agentic-btn agentic-btn-ghost agentic-btn--sm agentic-checkpoints__save"
					disabled={saving || isRunning}
					title="Snapshot touched files now"
					onClick={() => void onSave()}
				>
					{saving ? 'Saving…' : '+ Save'}
				</button>
			</div>
			<span className="agentic-checkpoints__hint">Rollback points — persisted for this workspace</span>
			{lastMessage && (
				<p className={`agentic-checkpoints__toast${lastMessage.toLowerCase().includes('restored') || lastMessage.toLowerCase().includes('saved') ? ' agentic-checkpoints__toast--ok' : ''}`}>
					{lastMessage}
				</p>
			)}
			<ul className="agentic-checkpoints__list">
				{sorted.map(cp => {
					const isLatest = cp.id === sorted[0]?.id;
					const busy = restoringId === cp.id;
					const expanded = expandedId === cp.id;
					const paths = cp.paths ?? [];
					return (
						<li
							key={cp.id}
							className={`agentic-checkpoints__item${isLatest ? ' agentic-checkpoints__item--latest' : ''}${expanded ? ' agentic-checkpoints__item--open' : ''}`}
						>
							<div className="agentic-checkpoints__item-head">
								<button
									type="button"
									className="agentic-checkpoints__expand"
									aria-expanded={expanded}
									disabled={!paths.length}
									onClick={() => setExpandedId(expanded ? null : cp.id)}
								>
									<span className="agentic-checkpoints__chevron" aria-hidden />
								</button>
								<div className="agentic-checkpoints__item-main">
									<span className="agentic-checkpoints__label">{cp.label}</span>
									<span className="agentic-checkpoints__time">
										{new Date(cp.createdAt).toLocaleString()}
									</span>
								</div>
								<button
									type="button"
									className="agentic-btn agentic-btn-ghost agentic-btn--sm agentic-checkpoints__restore"
									disabled={busy || isRunning}
									title={isRunning ? 'Wait for the current run to finish' : 'Restore files to this checkpoint'}
									onClick={() => void onRestore(cp.id)}
								>
									{busy ? '…' : 'Restore'}
								</button>
							</div>
							<div className="agentic-checkpoints__meta">
								{cp.fileCount !== undefined && (
									<span>{cp.fileCount} file{cp.fileCount === 1 ? '' : 's'}</span>
								)}
								{isLatest && <span className="agentic-pill agentic-pill--accent">Latest</span>}
							</div>
							{expanded && paths.length > 0 && (
								<ul className="agentic-checkpoints__files">
									{paths.slice(0, 16).map(p => (
										<li key={p} className="agentic-checkpoints__file" title={p}>
											{basename(p)}
										</li>
									))}
									{paths.length > 16 && (
										<li className="agentic-checkpoints__file agentic-checkpoints__file--more">
											+{paths.length - 16} more
										</li>
									)}
								</ul>
							)}
						</li>
					);
				})}
			</ul>
		</section>
	);
}
