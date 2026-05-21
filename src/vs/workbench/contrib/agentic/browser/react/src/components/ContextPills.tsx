import React from 'react';

export function ContextPills({ labels }: { labels: string[] }) {
	if (!labels.length) return null;
	return (
		<div className="agentic-pills">
			{labels.map(l => (
				<span key={l} className="agentic-pill">{l}</span>
			))}
		</div>
	);
}
