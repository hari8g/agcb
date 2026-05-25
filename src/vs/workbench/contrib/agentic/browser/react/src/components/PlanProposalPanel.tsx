import React, { useState } from 'react';
import type { ParsedPlanProposal } from '../../../../common/planProposalContent.js';
import type { ChatDecision } from '../../../../common/chatDecisionTypes.js';
import { getChatService } from '../util/agenticServices.js';

function onPlanAction(decision: ChatDecision | undefined, actionId: string): void {
	const chat = getChatService();
	const action = decision?.actions.find(a => a.id === actionId);
	if (action?.sendMessage) {
		if (action.id === 'execute_plan') {
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

export function PlanProposalPanel({
	proposal,
	decision,
}: {
	proposal: ParsedPlanProposal;
	decision?: ChatDecision;
}) {
	const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
		const init: Record<number, boolean> = {};
		proposal.sections.forEach((_, i) => {
			init[i] = i < 2;
		});
		return init;
	});

	const pending = decision && !decision.resolved;
	const actions = pending ? decision.actions : [];

	return (
		<section className="agentic-plan-card" aria-label="Improvement plan">
			<header className="agentic-plan-card__header">
				<span className="agentic-plan-card__badge">Plan</span>
				<h3 className="agentic-plan-card__title">Repository improvement plan</h3>
			</header>

			{proposal.leadIn && (
				<p className="agentic-plan-card__lead">{proposal.leadIn}</p>
			)}

			{proposal.sections.length > 0 && (
				<div className="agentic-plan-card__sections">
					{proposal.sections.map((section, i) => {
						const open = expanded[i] ?? false;
						return (
							<div key={`${section.heading}-${i}`} className="agentic-plan-card__section">
								<button
									type="button"
									className="agentic-plan-card__section-head"
									aria-expanded={open}
									onClick={() => setExpanded(e => ({ ...e, [i]: !open }))}
								>
									<span className="agentic-plan-card__section-chevron" aria-hidden>
										{open ? '▾' : '▸'}
									</span>
									<span className="agentic-plan-card__section-title">{section.heading}</span>
								</button>
								{open && (
									<div className="agentic-plan-card__section-body">
										{section.body && <p>{section.body}</p>}
										{section.bullets.length > 0 && (
											<ul>
												{section.bullets.map((b, j) => (
													<li key={j}>{b}</li>
												))}
											</ul>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{(proposal.closingPrompt || actions.length > 0) && (
				<footer className="agentic-plan-card__footer">
					{proposal.closingPrompt && (
						<p className="agentic-plan-card__question">{proposal.closingPrompt}</p>
					)}
					{actions.length > 0 && (
						<div className="agentic-plan-card__choices" role="group" aria-label="Plan actions">
							{actions.map(a => (
								<button
									key={a.id}
									type="button"
									className={
										a.variant === 'primary'
											? 'agentic-btn agentic-btn-primary agentic-plan-card__choice'
											: a.variant === 'secondary'
												? 'agentic-btn agentic-plan-card__choice'
												: 'agentic-btn agentic-btn-ghost agentic-plan-card__choice'
									}
									onClick={() => onPlanAction(decision, a.id)}
								>
									{a.label}
								</button>
							))}
						</div>
					)}
				</footer>
			)}
		</section>
	);
}
