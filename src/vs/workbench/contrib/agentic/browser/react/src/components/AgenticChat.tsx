import React from 'react';
import { ChatMessage } from './ChatMessage.js';
import { Composer } from './Composer.js';
import { ContextPills } from './ContextPills.js';
import { ApprovalPanel } from './ApprovalPanel.js';
import { CheckpointBanner } from './CheckpointBanner.js';
import { AgenticSettingsPanel } from './AgenticSettingsPanel.js';
import { JiraWorkflowPanel } from './JiraWorkflowPanel.js';
import {
	useAgenticThreads,
	useWorkspaceLabel,
	usePendingApprovals,
	getChatService,
	useAgenticSettings,
	useJiraMcpStatus,
} from '../util/agenticServices.js';

export function AgenticChat() {
	const { threads, currentThreadId } = useAgenticThreads();
	const workspace = useWorkspaceLabel();
	const pendingApprovals = usePendingApprovals();
	const thread = threads.find(t => t.id === currentThreadId) ?? null;
	const isRunning = !!thread?.currentRunId;

	const chat = getChatService();
	const settings = useAgenticSettings();
	const jiraMcpStatus = useJiraMcpStatus();

	const contextLabels: string[] = ['JIRA in chat'];
	if (settings.enableJiraWorkflow) {
		contextLabels.push('Auto JIRA keys');
	}
	if (thread?.includeActiveFile) contextLabels.push('Active file');
	if (thread?.includeSelection) contextLabels.push('Selection');

	return (
		<div className="agentic-root">
			<header className="agentic-header">
				<h1>MPS_AC Agent</h1>
				<div className="agentic-header-meta">
					Workspace: {workspace || '—'}
					<div className="agentic-header-jira" title={jiraMcpStatus}>
						JIRA MCP: {jiraMcpStatus}
					</div>
				</div>
				<AgenticSettingsPanel />
			</header>
			<div className="agentic-toolbar">
				<button type="button" className="agentic-btn" onClick={() => chat.createThread()}>New chat</button>
				<button
					type="button"
					className="agentic-btn agentic-btn-primary"
					disabled={isRunning}
					onClick={() => void chat.loadJiraTicketsInChat()}
				>
					Show JIRA in chat
				</button>
				{thread?.status === 'failed' && (
					<button type="button" className="agentic-btn" onClick={() => void chat.retryLastMessage()}>Retry</button>
				)}
			</div>
			<ContextPills labels={contextLabels} />
			<JiraWorkflowPanel />
			{thread && <CheckpointBanner checkpoints={thread.checkpoints} />}
			<div className="agentic-messages">
				{thread?.messages.map((m, idx) => {
					const isLastAssistant =
						m.role === 'assistant' &&
						idx === thread.messages.length - 1 &&
						m.state !== 'complete' &&
						m.state !== 'error';
					return (
						<ChatMessage
							key={m.id}
							message={m}
							isLive={isLastAssistant && isRunning}
						/>
					);
				})}
				<ApprovalPanel
					requests={pendingApprovals}
					onApprove={id => chat.approveEdit(id)}
					onReject={id => chat.rejectEdit(id)}
				/>
			</div>
			<Composer
				isRunning={isRunning}
				includeActiveFile={thread?.includeActiveFile ?? true}
				includeSelection={thread?.includeSelection ?? true}
				autoApplyEdits={thread?.autoApplyEdits ?? false}
				onToggleActiveFile={() => chat.setIncludeActiveFile(!(thread?.includeActiveFile ?? true))}
				onToggleSelection={() => chat.setIncludeSelection(!(thread?.includeSelection ?? true))}
				onToggleAutoApply={() => chat.setAutoApplyEdits(!(thread?.autoApplyEdits ?? false))}
				jiraWorkflowEnabled={true}
				onJiraListTickets={() => void chat.loadJiraTicketsInChat()}
				onSend={text => void chat.sendUserMessage(text)}
				onStop={() => chat.stopCurrentRun()}
			/>
		</div>
	);
}
