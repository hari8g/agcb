import React, { useCallback, useEffect, useState } from 'react';
import type { MemoryFact, SessionMemorySnapshot } from '../../../../common/sessionMemoryTypes.js';
import { getSessionMemoryService } from '../util/agenticServices.js';

function kindLabel(kind: MemoryFact['kind']): string {
	return kind.replace(/_/g, ' ');
}

function FactList(props: {
	title: string;
	facts: MemoryFact[];
	empty: string;
	onRemove?: (id: string) => void;
}) {
	if (!props.facts.length) {
		return (
			<div className="agentic-memory__group">
				<h4>{props.title}</h4>
				<p className="agentic-memory__empty">{props.empty}</p>
			</div>
		);
	}
	return (
		<div className="agentic-memory__group">
			<h4>{props.title}</h4>
			<ul className="agentic-memory__facts">
				{props.facts.map(f => (
					<li key={f.id} className="agentic-memory__fact">
						<span className="agentic-pill agentic-pill--muted agentic-memory__kind">{kindLabel(f.kind)}</span>
						<span className="agentic-memory__text">{f.text}</span>
						<span className="agentic-memory__meta">{f.source}</span>
						{props.onRemove && (
							<button
								type="button"
								className="agentic-memory__remove"
								title="Remove this fact"
								aria-label="Remove fact"
								onClick={() => props.onRemove!(f.id)}
							>
								×
							</button>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

export function SessionMemoryPanel() {
	const [snapshot, setSnapshot] = useState<SessionMemorySnapshot | null>(null);
	const [scanning, setScanning] = useState(false);

	const sync = useCallback(() => {
		setSnapshot(getSessionMemoryService().getSnapshot());
	}, []);

	useEffect(() => {
		const svc = getSessionMemoryService();
		sync();
		const sub = svc.onDidChange(sync);
		return () => sub.dispose();
	}, [sync]);

	if (!snapshot) {
		return null;
	}

	const projectFacts = snapshot.project.facts;
	const userFacts = snapshot.user.facts;
	const tags = snapshot.project.tags;
	const total = projectFacts.length + userFacts.length;
	const memorySvc = getSessionMemoryService();

	return (
		<div className="agentic-memory agentic-memory--glass">
			{tags.length > 0 && (
				<div className="agentic-memory__tags">
					{tags.map(tag => (
						<span key={tag} className="agentic-pill agentic-pill--accent">
							{tag}
						</span>
					))}
				</div>
			)}

			{total === 0 ? (
				<p className="agentic-memory__empty">
					No memory stored yet. Say “remember I prefer …” or run a few agent tasks — facts are inferred from successful edits.
				</p>
			) : (
				<>
					<FactList
						title="Your preferences"
						facts={userFacts}
						empty="No user facts yet."
						onRemove={id => memorySvc.removeUserFact(id)}
					/>
					<FactList
						title="Project context"
						facts={projectFacts}
						empty="Run a workspace scan to populate project facts."
					/>
				</>
			)}

			<div className="agentic-memory__actions">
				<button
					type="button"
					className="agentic-btn agentic-btn-ghost agentic-btn--sm"
					disabled={scanning}
					onClick={() => {
						setScanning(true);
						void memorySvc.refreshProjectScan().finally(() => setScanning(false));
					}}
				>
					{scanning ? 'Scanning…' : 'Refresh project scan'}
				</button>
				<button
					type="button"
					className="agentic-btn agentic-btn-ghost agentic-btn--sm"
					disabled={!userFacts.length}
					onClick={() => memorySvc.clearUserMemory()}
				>
					Clear preferences
				</button>
			</div>
		</div>
	);
}
