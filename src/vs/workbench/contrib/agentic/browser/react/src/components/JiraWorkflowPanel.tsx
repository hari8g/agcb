import React, { useState } from 'react';
import { getChatService, getJiraWorkflowService, useInteractiveJiraWorkflow } from '../util/agenticServices.js';
import { OpenTicketsList } from './jira/OpenTicketsList.js';
import { JiraTicketDetails } from './jira/JiraTicketDetails.js';
import { JiraWorkflowPlanView } from './jira/JiraWorkflowPlan.js';
import { JiraWorkflowStream } from './jira/JiraWorkflowStream.js';
import { JiraWorkflowCheckpoints } from './jira/JiraWorkflowCheckpoints.js';
import { WorkflowDecisionButtons } from './jira/WorkflowDecisionButtons.js';

export function JiraWorkflowPanel() {
	const wf = useInteractiveJiraWorkflow();
	const jira = getJiraWorkflowService();
	const chat = getChatService();
	const [projectFilter, setProjectFilter] = useState('');

	return (
		<div className="agentic-jira-panel agentic-jira-panel--interactive">
			<header className="agentic-jira-panel__header">
				<div>
					<div className="agentic-jira-panel__title">JIRA Workflow</div>
					<div className="agentic-jira-panel__subtitle">
						Sidebar workflow. For tickets inside the chat thread, click <strong>Show JIRA in chat</strong> in the toolbar or composer below.
					</div>
				</div>
				<button type="button" className="agentic-btn agentic-btn-ghost" onClick={() => void jira.openMcpConfig()}>
					MCP config
				</button>
			</header>

			<OpenTicketsList
				tickets={wf.openTickets}
				selectedKey={wf.selectedTicket?.key ?? null}
				loading={wf.ticketsLoading}
				error={wf.error}
				onRefresh={() => void jira.refreshOpenTickets(projectFilter.trim() || undefined)}
				onSelect={t => void jira.selectTicket(t)}
			/>

			<div className="agentic-jira-advanced">
				<button
					type="button"
					className="agentic-btn agentic-btn-ghost agentic-btn--sm"
					onClick={() => jira.setShowAdvancedInput(!wf.showAdvancedInput)}
				>
					{wf.showAdvancedInput ? 'Hide manual key' : 'Advanced: manual ticket key'}
				</button>
				{wf.showAdvancedInput && (
					<div className="agentic-jira-panel__row">
						<input
							type="text"
							placeholder="KAN-4"
							value={wf.manualIssueKey}
							onChange={e => jira.setManualIssueKey(e.target.value)}
							className="agentic-jira-input"
						/>
						<button
							type="button"
							className="agentic-btn"
							disabled={!wf.manualIssueKey.trim()}
							onClick={() => void jira.selectTicketByKey(wf.manualIssueKey.trim())}
						>
							Load ticket
						</button>
					</div>
				)}
				{wf.showAdvancedInput && (
					<input
						type="text"
						className="agentic-jira-input agentic-jira-input--filter"
						placeholder="Project key filter (e.g. KAN)"
						value={projectFilter}
						onChange={e => setProjectFilter(e.target.value.toUpperCase())}
					/>
				)}
			</div>

			<JiraTicketDetails ticket={wf.selectedTicket} loading={wf.detailsLoading} />
			<JiraWorkflowPlanView plan={wf.plan} loading={wf.planLoading} />

			<WorkflowDecisionButtons
				hasPlan={!!wf.plan}
				planLoading={wf.planLoading}
				executing={wf.executing}
				phase={wf.phase}
				onAccept={() => void chat.acceptJiraWorkflowInChat()}
				onDecline={() => jira.declineWorkflow()}
				onRegenerate={() => void jira.regeneratePlan()}
			/>

			<JiraWorkflowStream events={wf.events} />
			<JiraWorkflowCheckpoints
				checkpoints={wf.checkpoints}
				onRestore={id => void jira.restoreCheckpoint(id)}
			/>
		</div>
	);
}
