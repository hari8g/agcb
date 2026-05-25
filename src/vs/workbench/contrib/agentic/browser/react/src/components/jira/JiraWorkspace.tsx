import React from 'react';
import { getChatService, useInteractiveJiraWorkflow } from '../../util/agenticServices.js';
import { buildJiraWorkflowDecision, jiraInteractiveToChatUi } from '../../agentic-bundle-types.js';
import { JiraTicketList } from './JiraTicketList.js';
import { JiraWorkflowPlanView } from './JiraWorkflowPlan.js';
import { JiraWorkflowStream } from './JiraWorkflowStream.js';
import { JiraWorkflowResult } from './JiraWorkflowResult.js';
import { JiraExecutionPanel } from './JiraExecutionPanel.js';
import { JiraAgentActivity } from './JiraAgentActivity.js';

export function JiraWorkspace() {
	const interactive = useInteractiveJiraWorkflow();
	const ui = jiraInteractiveToChatUi(interactive);
	const chat = getChatService();
	const decision = buildJiraWorkflowDecision(ui);
	const canRun = !!decision;
	const isRunning = ui.executing || ui.mode === 'executing';
	const showList = !ui.selectedTicket;

	if (interactive.ticketsLoading && !ui.tickets.length && !ui.selectedTicket) {
		return <div className="agentic-jira-panel agentic-jira-panel--loading">Loading tickets…</div>;
	}

	if (ui.error && !ui.tickets.length && !ui.selectedTicket) {
		return (
			<div className="agentic-jira-panel agentic-jira-panel--error">
				<p className="agentic-jira-panel__error">{ui.error}</p>
				<button type="button" className="agentic-btn agentic-btn-ghost agentic-btn--sm" onClick={() => void chat.refreshJiraTicketsInChat()}>
					Retry
				</button>
			</div>
		);
	}

	if (showList) {
		return (
			<div className="agentic-jira-panel agentic-jira-panel--list">
				<div className="agentic-jira-panel__head agentic-jira-panel__head--modern">
					<div className="agentic-jira-panel__head-text">
						<span className="agentic-jira-panel__title">Jira</span>
						<span className="agentic-jira-panel__subtitle">Open tickets in your workspace</span>
					</div>
					<button
						type="button"
						className="agentic-btn agentic-btn--soft agentic-btn--sm"
						disabled={interactive.ticketsLoading}
						onClick={() => void chat.refreshJiraTicketsInChat()}
					>
						Refresh
					</button>
				</div>
				<div className="agentic-jira-panel__body">
					<JiraTicketList
						tickets={ui.tickets}
						openOnly
						onSelectOpen={key => void chat.pickJiraTicketInChat(key)}
					/>
				</div>
			</div>
		);
	}

	if (ui.selectedTicket) {
		const t = ui.selectedTicket;
		const showRunUi = isRunning || ui.mode === 'complete' || ui.mode === 'stalled' || ui.events.length > 0;
	const showAgentPanels = isRunning || ui.mode === 'complete' || ui.mode === 'stalled';
		return (
			<div className="agentic-jira-panel agentic-jira-panel--detail">
				<div className="agentic-jira-panel__head agentic-jira-panel__head--modern">
					<button type="button" className="agentic-btn agentic-btn--soft agentic-btn--sm" onClick={() => chat.showJiraTicketListInChat()}>
						← Tickets
					</button>
					{ui.plan && !ui.planLoading && !isRunning && (
						<button
							type="button"
							className="agentic-btn agentic-btn--soft agentic-btn--sm"
							onClick={() => void chat.regenerateJiraPlanInChat()}
						>
							Replan
						</button>
					)}
				</div>
				<div className="agentic-jira-panel__body agentic-jira-panel__body--scroll">
					<div className="agentic-jira-panel__ticket agentic-jira-panel__ticket--hero">
						<span className="agentic-jira-panel__key">{t.key}</span>
						<span className="agentic-jira-panel__summary">{t.summary}</span>
						{(t.status || t.priority || t.issueType) && (
							<div className="agentic-jira-panel__meta agentic-highlight-bar agentic-highlight-bar--inline">
								{t.status && <span className="agentic-pill agentic-pill--status">{t.status}</span>}
								{t.priority && <span className="agentic-pill agentic-pill--priority-high">{t.priority}</span>}
								{t.issueType && <span className="agentic-pill agentic-pill--type">{t.issueType}</span>}
							</div>
						)}
					</div>
					{interactive.detailsLoading && <p className="agentic-jira-panel__status">Loading ticket details…</p>}
					{t.description && (
						<div className="agentic-jira-description agentic-jira-description--panel">
							<div className="agentic-jira-description__label">Description</div>
							<pre>{t.description.length > 2000 ? `${t.description.slice(0, 2000)}…` : t.description}</pre>
						</div>
					)}
					{ui.error && <p className="agentic-jira-panel__error">{ui.error}</p>}
					{(isRunning || ui.mode === 'complete' || ui.mode === 'stalled' || ui.executionChangedFiles.length > 0) && (
						<JiraExecutionPanel ui={ui} />
					)}
					{showAgentPanels && (
						<JiraAgentActivity showWhileRunning={isRunning} showAfterRun={ui.mode === 'complete' || ui.mode === 'stalled'} />
					)}
					<JiraWorkflowResult ui={ui} />
					{ui.planLoading && <p className="agentic-jira-panel__status">Planning…</p>}
					{!isRunning && !ui.planLoading && ui.plan && <JiraWorkflowPlanView plan={ui.plan} loading={false} />}
					{isRunning && ui.plan && (
						<details className="agentic-jira-panel__plan-fold">
							<summary>Approved plan</summary>
							<JiraWorkflowPlanView plan={ui.plan} loading={false} />
						</details>
					)}
					{showRunUi && <JiraWorkflowStream events={ui.events} />}
					{canRun && !isRunning && ui.mode !== 'stalled' && (
						<div className="agentic-jira-panel__actions agentic-jira-panel__actions--sticky">
							<button type="button" className="agentic-btn agentic-btn-primary agentic-btn--lg" onClick={() => void chat.acceptJiraWorkflowInChat()}>
								Run workflow
							</button>
							<button type="button" className="agentic-btn agentic-btn--soft" onClick={() => chat.declineJiraWorkflowInChat()}>
								Cancel
							</button>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="agentic-jira-panel agentic-jira-panel--empty">
			<p className="agentic-jira-panel__empty">No tickets loaded.</p>
			<button type="button" className="agentic-btn agentic-btn-primary agentic-btn--sm" onClick={() => void chat.loadJiraTicketsInChat()}>
				Load tickets
			</button>
		</div>
	);
}
