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
			{pending.map(r => {
				const items = r.items?.length ? r.items : [{
					toolCallId: r.toolCallId,
					toolName: r.toolName ?? 'tool',
					title: r.title,
					description: r.description,
					preview: r.preview,
					filePath: r.filePath,
				}];
				return (
					<div key={r.id} className="agentic-approval-card" style={{ marginBottom: 12 }}>
						<div>{r.title}</div>
						{items.map((item, idx) => (
							<div key={item.toolCallId || idx} style={{ marginTop: 8, paddingLeft: items.length > 1 ? 8 : 0, borderLeft: items.length > 1 ? '2px solid var(--vscode-panel-border)' : undefined }}>
								{items.length > 1 && (
									<div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
								)}
								{item.filePath && (
									<div style={{ fontSize: 11, opacity: 0.8 }}>{item.filePath}</div>
								)}
								<div style={{ fontSize: 12, opacity: 0.85 }}>{item.description}</div>
								{item.preview && (
									<pre style={{ fontSize: 11, maxHeight: 120, overflow: 'auto' }}>{item.preview}</pre>
								)}
							</div>
						))}
						<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
							<button type="button" className="agentic-btn agentic-btn-primary" onClick={() => onApprove(r.id)}>
								{items.length > 1 ? `Approve all (${items.length})` : 'Approve'}
							</button>
							<button type="button" className="agentic-btn" onClick={() => onReject(r.id)}>Reject</button>
						</div>
					</div>
				);
			})}
		</div>
	);
}
