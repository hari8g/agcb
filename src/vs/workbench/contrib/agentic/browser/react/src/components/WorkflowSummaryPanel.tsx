import React, { useState } from 'react';
import type { WorkflowCompletionSummary } from '../../../../common/workflowSummary.js';
import { getChatService } from '../util/agenticServices.js';

const STATUS_LABEL: Record<WorkflowCompletionSummary['completionKind'], string> = {
	success: 'Done',
	partial: 'Partial',
	failed: 'Needs edits',
	stalled: 'No tools run',
};

export function WorkflowSummaryPanel({ summary }: { summary: WorkflowCompletionSummary }) {
	const [showDetails, setShowDetails] = useState(false);
	const isOk = summary.completionKind === 'success';
	const outcomeLine = summary.outcome.split('\n')[0]?.replace(/\*\*/g, '') ?? '';

	const extended = summary as WorkflowCompletionSummary & {
		qualityScore?: number;
		verificationResult?: string;
		understood?: string;
	};

	return (
		<section
			className={`agentic-run-outcome agentic-run-outcome--${summary.completionKind}`}
			aria-label="Run outcome"
		>
			<div className="agentic-run-outcome__row">
				<span className="agentic-run-outcome__status">{STATUS_LABEL[summary.completionKind]}</span>
				{extended.qualityScore !== undefined && (
					<span className="agentic-run-outcome__score">Quality {extended.qualityScore}/100</span>
				)}
				{extended.verificationResult && (
					<span className="agentic-run-outcome__verify">Verify: {extended.verificationResult}</span>
				)}
				{!isOk && outcomeLine && (
					<span className="agentic-run-outcome__message">{outcomeLine.slice(0, 160)}</span>
				)}
				{(summary.actions.length > 0 || summary.filesTouched.length > 0) && (
					<button
						type="button"
						className="agentic-run-outcome__details-btn"
						onClick={() => setShowDetails(d => !d)}
					>
						{showDetails ? 'Hide' : 'Details'}
					</button>
				)}
			</div>
			{(summary.completionKind === 'failed' || summary.completionKind === 'stalled' || summary.completionKind === 'partial') && (
				<div className="agentic-run-outcome__actions">
					<button
						type="button"
						className="agentic-btn agentic-btn-primary agentic-btn--sm"
						onClick={() => void getChatService().continueAfterStall()}
					>
						Continue
					</button>
				</div>
			)}
			{showDetails && (
				<div className="agentic-run-outcome__details">
					{summary.actions.length > 0 && (
						<ul className="agentic-run-outcome__tools">
							{summary.actions.map((a, i) => (
								<li key={i}>
									<span className={`agentic-run-outcome__tool-status agentic-run-outcome__tool-status--${a.status}`}>
										{a.status}
									</span>
									{a.label}
								</li>
							))}
						</ul>
					)}
					{summary.filesTouched.length > 0 && (
						<div className="agentic-run-outcome__files">
							{summary.filesTouched.map(f => (
								<code key={f.path}>{f.path.split(/[/\\]/).pop()}</code>
							))}
						</div>
					)}
				</div>
			)}
		</section>
	);
}
