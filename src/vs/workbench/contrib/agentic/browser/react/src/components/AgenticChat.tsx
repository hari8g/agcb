import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from './ChatMessage.js';
import { Composer } from './Composer.js';
import { ChatBottomBar } from './ChatBottomBar.js';
import { AgenticSettingsPanel } from './AgenticSettingsPanel.js';
import { AgentStatusBar } from './AgentStatusBar.js';
import { WorkflowOrchestrationStrip } from './WorkflowOrchestrationStrip.js';
import { WorkflowRunPlanPanel } from './WorkflowRunPlanPanel.js';
import { AgentMissionControl } from './AgentMissionControl.js';
import { AgenticVoidCommandBar } from './AgenticVoidCommandBar.js';
import {
	useAgenticThreads,
	useWorkspaceLabel,
	usePendingApprovals,
	getChatService,
	useAgenticSettings,
	useJiraMcpStatus,
	useLiveAgentStatus,
} from '../util/agenticServices.js';
import { COMPOSER_AGENT_MODES, type ComposerAgentModeId } from '../../../../common/agentModes.js';
import { isVoidLikeSimpleUiMode, shouldSkipWorkflowChrome } from '../../../../common/voidLikeChatMode.js';

export function AgenticChat() {
	const [settingsOpen, setSettingsOpen] = useState(false);
	const { threads, currentThreadId } = useAgenticThreads();
	const workspace = useWorkspaceLabel();
	const pendingApprovals = usePendingApprovals();
	const liveStatusHook = useLiveAgentStatus();
	const thread = threads.find(t => t.id === currentThreadId) ?? null;
	const liveStatus = liveStatusHook ?? thread?.liveStatus ?? null;
	const isRunning = !!thread?.currentRunId;
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const chat = getChatService();
	const settings = useAgenticSettings();
	const jiraMcpStatus = useJiraMcpStatus();

	const voidLike = isVoidLikeSimpleUiMode(thread?.runUiMode);
	const showWorkflowChrome = !shouldSkipWorkflowChrome(thread?.runUiMode);

	const filteredApprovals = pendingApprovals.filter(
		r => !thread?.messages.some(m => m.decision?.approvalId === r.id && !m.decision?.resolved),
	);

	const visibleMessages = thread?.messages ?? [];
	const isEmpty = visibleMessages.length === 0;

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
	}, [visibleMessages.length, isRunning, liveStatus?.detail, filteredApprovals.length, thread?.status]);

	const agentModeId: ComposerAgentModeId = thread?.agentModeId ?? 'agent';
	const activeMode = COMPOSER_AGENT_MODES.find(m => m.id === agentModeId) ?? COMPOSER_AGENT_MODES[0];

	return (
		<div className={`agentic-root agentic-root--chat${voidLike ? ' agentic-root--void-like' : ' agentic-root--aurora'}`}>
			<header className="agentic-chat-header agentic-chat-header--slim">
				<div className="agentic-chat-header__brand">
					<span className="agentic-chat-header__title">{voidLike ? 'Chat' : 'Agentic'}</span>
					{!voidLike && (
						<span className={`agentic-mode-badge agentic-mode-badge--${agentModeId}`} title={activeMode.description}>
							{activeMode.shortLabel}
						</span>
					)}
					{workspace && <span className="agentic-chat-header__meta">{workspace}</span>}
					{isRunning && <span className="agentic-chat-header__pulse" aria-hidden />}
				</div>
				<div className="agentic-chat-header__actions">
					{thread?.status === 'failed' && (
						<button
							type="button"
							className="agentic-chat-icon-btn"
							title="Retry last message"
							onClick={() => void chat.retryLastMessage()}
						>
							↻
						</button>
					)}
					{!voidLike && <AgentMissionControl />}
					<button type="button" className="agentic-chat-icon-btn" title="New chat" onClick={() => chat.createThread()}>
						+
					</button>
					<button
						type="button"
						className={`agentic-chat-icon-btn${settingsOpen ? ' agentic-chat-icon-btn--active' : ''}`}
						title="Settings"
						onClick={() => setSettingsOpen(o => !o)}
					>
						⚙
					</button>
				</div>
			</header>

			{showWorkflowChrome && (
				<>
					<WorkflowOrchestrationStrip
						snapshot={thread?.workflowSnapshot}
						canonicalSnapshot={thread?.canonicalWorkflowSnapshot}
						isRunning={isRunning}
					/>
					<WorkflowRunPlanPanel
						plan={thread?.workflowRunPlan}
						snapshot={thread?.workflowSnapshot}
						isRunning={isRunning}
					/>
				</>
			)}
			{voidLike && isRunning && liveStatus?.detail && (
				<div className="agentic-chat-void-status" aria-live="polite">
					{liveStatus.detail}
				</div>
			)}
			{!voidLike && <AgentStatusBar status={liveStatus} isRunning={isRunning} />}

			<AgenticSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

			<main className="agentic-chat-main">
				{isEmpty ? (
					<div className="agentic-chat-empty">
						<p className="agentic-chat-empty__title">What should we work on?</p>
						<p className="agentic-chat-empty__hint">
							Ask a question or describe a change — edits appear in the editor with accept/reject.
						</p>
						{/connected|ready/i.test(jiraMcpStatus) && (
							<p className="agentic-chat-empty__hint agentic-chat-empty__hint--sub">
								JIRA tickets: open the Composer view in the sidebar.
							</p>
						)}
					</div>
				) : (
					<div className="agentic-chat-thread">
						{visibleMessages.map((m, idx) => {
							const isLastAssistant =
								m.role === 'assistant'
								&& idx === visibleMessages.length - 1
								&& m.state !== 'complete'
								&& m.state !== 'error';
							return (
								<ChatMessage
									key={m.id}
									message={m}
									isLive={isLastAssistant && isRunning}
									voidLike={voidLike}
								/>
							);
						})}
						<div ref={messagesEndRef} className="agentic-chat-thread__anchor" />
					</div>
				)}
			</main>

			<footer className="agentic-chat-footer">
				<AgenticVoidCommandBar />
				<ChatBottomBar requests={filteredApprovals} />
				<Composer
					isRunning={isRunning}
					includeActiveFile={thread?.includeActiveFile ?? true}
					includeSelection={thread?.includeSelection ?? true}
					autoApplyEdits={thread?.autoApplyEdits ?? false}
					agentModeId={agentModeId}
					onAgentModeChange={modeId => chat.setAgentMode(modeId)}
					onToggleActiveFile={() => chat.setIncludeActiveFile(!(thread?.includeActiveFile ?? true))}
					onToggleSelection={() => chat.setIncludeSelection(!(thread?.includeSelection ?? true))}
					onToggleAutoApply={() => chat.setAutoApplyEdits(!(thread?.autoApplyEdits ?? false))}
					onSend={text => void chat.sendUserMessage(text)}
					onStop={() => chat.stopCurrentRun()}
				/>
			</footer>
		</div>
	);
}
