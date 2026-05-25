import React, { useEffect, useRef } from 'react';
import type { ApprovalRequest } from '../../../../common/agenticTypes.js';
import { ApprovalPanel } from './ApprovalPanel.js';

/** Sticky approval UI above the composer — always at the bottom of the chat stream. */
export function ApprovalDock({
	requests,
	onApprove,
	onReject,
}: {
	requests: ApprovalRequest[];
	onApprove: (id: string) => void;
	onReject: (id: string) => void;
}) {
	const dockRef = useRef<HTMLDivElement>(null);
	const pending = requests.filter(r => r.decision === 'pending');

	useEffect(() => {
		if (pending.length > 0) {
			dockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
		}
	}, [pending.length, pending.map(r => r.id).join(',')]);

	if (!pending.length) {
		return null;
	}

	return (
		<div ref={dockRef} className="agentic-approval-dock" role="region" aria-label="Approval required">
			<ApprovalPanel requests={requests} onApprove={onApprove} onReject={onReject} />
		</div>
	);
}
