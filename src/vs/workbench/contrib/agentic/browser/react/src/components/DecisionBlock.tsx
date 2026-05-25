import React from 'react';
import type { ChatDecision, ChatDecisionActionId } from '../../../../common/chatDecisionTypes.js';
import { getChatService } from '../util/agenticServices.js';

export function DecisionBlock({ decision }: { decision: ChatDecision }) {
	if (decision.resolved) {
		return null;
	}

	const chat = getChatService();

	const onAction = (actionId: ChatDecisionActionId) => {
		if (decision.kind === 'jira_workflow') {
			switch (actionId) {
				case 'proceed':
					void chat.acceptJiraWorkflowInChat();
					break;
				case 'decline':
					chat.declineJiraWorkflowInChat();
					break;
				case 'regenerate':
					void chat.regenerateJiraPlanInChat();
					break;
			}
			return;
		}
		if (decision.kind === 'tool_approval' && decision.approvalId) {
			if (actionId === 'approve') {
				chat.approveEdit(decision.approvalId);
			} else if (actionId === 'reject') {
				chat.rejectEdit(decision.approvalId);
			}
			return;
		}
		if (decision.kind === 'plan_execute' || decision.kind === 'plan_exploration') {
			const action = decision.actions.find(a => a.id === actionId);
			if (action?.sendMessage) {
				if (actionId === 'execute_plan') {
					void chat.executeApprovedPlan();
					return;
				}
				chat.resolvePlanDecision();
				void chat.sendUserMessage(action.sendMessage);
				return;
			}
			if (actionId === 'execute_plan') {
				void chat.executeApprovedPlan();
			} else if (actionId === 'revise_plan') {
				chat.resolvePlanDecision();
				void chat.sendUserMessage('/plan Revise the plan based on my feedback: ');
			}
		}
	};

	return (
		<div className="agentic-decision" role="group" aria-label={decision.title}>
			<div className="agentic-decision__title">{decision.title}</div>
			{decision.hint && <div className="agentic-decision__hint">{decision.hint}</div>}
			<div className="agentic-decision__actions">
				{decision.actions.map(a => (
					<button
						key={a.id}
						type="button"
						className={
							a.variant === 'primary'
								? 'agentic-btn agentic-btn-primary'
								: a.variant === 'secondary'
									? 'agentic-btn'
									: 'agentic-btn agentic-btn-ghost'
						}
						onClick={() => onAction(a.id)}
					>
						{a.label}
					</button>
				))}
			</div>
		</div>
	);
}
