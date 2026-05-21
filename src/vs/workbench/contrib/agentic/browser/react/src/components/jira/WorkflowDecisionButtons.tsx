import React from 'react';

export function WorkflowDecisionButtons(props: {
	hasPlan: boolean;
	planLoading: boolean;
	executing: boolean;
	phase: string;
	onAccept: () => void;
	onDecline: () => void;
	onRegenerate: () => void;
}) {
	const { hasPlan, planLoading, executing, phase, onAccept, onDecline, onRegenerate } = props;
	const show = hasPlan && (phase === 'awaiting_decision' || phase === 'plan_ready' || phase === 'details_ready');
	if (!show && phase !== 'executing' && phase !== 'completed' && phase !== 'declined') {
		return null;
	}

	return (
		<div className="agentic-jira-decisions">
			<button
				type="button"
				className="agentic-btn agentic-btn-primary"
				disabled={!hasPlan || planLoading || executing}
				onClick={onAccept}
			>
				{executing ? 'Running workflow…' : 'Accept workflow'}
			</button>
			<button
				type="button"
				className="agentic-btn"
				disabled={planLoading || executing}
				onClick={onRegenerate}
			>
				Regenerate plan
			</button>
			<button
				type="button"
				className="agentic-btn agentic-btn-ghost"
				disabled={executing}
				onClick={onDecline}
			>
				Decline workflow
			</button>
		</div>
	);
}
