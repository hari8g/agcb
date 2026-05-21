import React from 'react';
import type { ApprovalRequest } from '../../../../common/agenticTypes.js';

export function ApprovalPanel({
	requests,
	onApprove,
	onReject,
}: {
	requests: ApprovalRequest[];
	onApprove: (id: string) => void;
	onReject: (id: string) => void;
}) {
	const pending = requests.filter(r => r.decision === 'pending');
	if (!pending.length) return null;
	return (
		<div className="agentic-approval">
			<div style={{ fontWeight: 600, marginBottom: 8 }}>Approval required</div>
			{pending.map(r => (
				<div key={r.id} style={{ marginBottom: 10 }}>
					<div>{r.title}</div>
					<div style={{ fontSize: 12, opacity: 0.85 }}>{r.description}</div>
					{r.preview && <pre style={{ fontSize: 11, maxHeight: 120, overflow: 'auto' }}>{r.preview}</pre>}
					<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
						<button type="button" className="agentic-btn agentic-btn-primary" onClick={() => onApprove(r.id)}>Approve</button>
						<button type="button" className="agentic-btn" onClick={() => onReject(r.id)}>Reject</button>
					</div>
				</div>
			))}
		</div>
	);
}
