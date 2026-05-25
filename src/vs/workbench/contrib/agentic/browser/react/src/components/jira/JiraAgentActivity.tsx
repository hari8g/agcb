import React from 'react';
import { useAgenticThreads, useLiveAgentStatus } from '../../util/agenticServices.js';
import { AgentStatusBar } from '../AgentStatusBar.js';
import { ActivityFeed } from '../ActivityFeed.js';
import { LiveStreamPanel } from '../LiveStreamPanel.js';
import { ReasoningPanel } from '../ReasoningPanel.js';
import { WorkflowFilesPanel } from '../WorkflowFilesPanel.js';
import { WorkflowSummaryPanel } from '../WorkflowSummaryPanel.js';

/**
 * Intelligent agent output for JIRA workflow runs — mirrors main chat:
 * status bar, reasoning, files, activity, stream, and end-of-run summary.
 */
export function JiraAgentActivity(props: {
	/** Active execution (phase executing). */
	showWhileRunning: boolean;
	/** Show panels after run until user leaves ticket (complete / stalled). */
	showAfterRun?: boolean;
}) {
	const { threads, currentThreadId } = useAgenticThreads();
	const live = useLiveAgentStatus();
	const thread = threads.find(t => t.id === currentThreadId);
	const assistant = thread?.messages
		? [...thread.messages].reverse().find(m => m.role === 'assistant')
		: undefined;

	const isRunning = thread?.status === 'running' || thread?.status === 'waiting_approval';
	const runActive = props.showWhileRunning && isRunning;
	const postRunActive =
		props.showAfterRun
		&& !isRunning
		&& assistant
		&& (assistant.workflowSummary || assistant.activityLines?.length);

	if (!runActive && !postRunActive) {
		return null;
	}

	const isLive = runActive && assistant?.state !== 'complete' && assistant?.state !== 'error';

	return (
		<section className="agentic-jira-section agentic-jira-run agentic-jira-run--intelligent">
			<h3>{runActive ? 'Agent run' : 'Agent run summary'}</h3>
			<AgentStatusBar status={live} isRunning={!!runActive} />
			{assistant ? (
				<div className="agentic-jira-run__panels">
					<ReasoningPanel message={assistant} isLive={isLive} />
					<ActivityFeed message={assistant} />
					<WorkflowFilesPanel message={assistant} isLive={isLive} />
					<LiveStreamPanel message={assistant} runActive={!!runActive} />
					{assistant.workflowSummary && !runActive && (
						<WorkflowSummaryPanel summary={assistant.workflowSummary} />
					)}
					{assistant.workflowSummary && runActive && assistant.state === 'complete' && (
						<WorkflowSummaryPanel summary={assistant.workflowSummary} />
					)}
				</div>
			) : (
				<div className="agentic-jira-empty">Starting agent — output will appear here…</div>
			)}
		</section>
	);
}
