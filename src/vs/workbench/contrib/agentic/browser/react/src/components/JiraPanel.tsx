import React, { useEffect, useState } from 'react';
import { ApprovalPanel } from './ApprovalPanel.js';
import { AgenticSettingsPanel } from './AgenticSettingsPanel.js';
import { JiraWorkspace } from './jira/JiraWorkspace.js';
import {
	useAgenticThreads,
	usePendingApprovals,
	getChatService,
} from '../util/agenticServices.js';

/** JIRA workflow rail — lives beside Void chat in the auxiliary bar. */
export function JiraPanel() {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const { currentThreadId } = useAgenticThreads();
	const pendingApprovals = usePendingApprovals();
	const chat = getChatService();

	useEffect(() => {
		const t = window.setTimeout(() => void chat.loadJiraTicketsInChat(), 400);
		return () => window.clearTimeout(t);
	}, []);

	const thread = chat.getCurrentThread();
	const threadId = currentThreadId;

	return (
		<div className="agentic-root agentic-root--jira-rail">
			<div className="agentic-top">
				<header className="agentic-header agentic-header--compact">
					<h1 className="agentic-header__title">Composer · JIRA</h1>
					<button
						type="button"
						className="agentic-btn agentic-btn-ghost agentic-btn--sm"
						aria-expanded={settingsOpen}
						onClick={() => setSettingsOpen(o => !o)}
					>
						Settings
					</button>
				</header>
				<AgenticSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
			</div>
			<div className="agentic-main agentic-main--jira-rail">
				<JiraWorkspace key={threadId ?? 'none'} />
			</div>
			{pendingApprovals.length > 0 && (
				<div className="agentic-approvals">
					<ApprovalPanel
						requests={pendingApprovals.filter(
							r => !thread?.messages.some(m => m.decision?.approvalId === r.id && !m.decision?.resolved),
						)}
						onApprove={id => chat.approveEdit(id)}
						onReject={id => chat.rejectEdit(id)}
					/>
				</div>
			)}
		</div>
	);
}
