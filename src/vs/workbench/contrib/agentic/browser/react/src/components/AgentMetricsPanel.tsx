import React, { useEffect, useState } from 'react';
import type { AgentMetricsDashboard } from '../../../../common/agentRunMetrics.js';
import { getAgentMetricsService } from '../util/agenticServices.js';

function pct(n: number): string {
	return `${Math.round(n * 100)}%`;
}

function formatMs(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentMetricsPanel() {
	const [dash, setDash] = useState<AgentMetricsDashboard | null>(null);

	useEffect(() => {
		const svc = getAgentMetricsService();
		const sync = () => setDash(svc.getDashboard());
		sync();
		const sub = svc.onDidChange(sync);
		return () => sub.dispose();
	}, []);

	if (!dash || dash.totalRuns === 0) {
		return (
			<div className="agentic-metrics">
				<p className="agentic-metrics__empty">No agent runs recorded yet in this session. Send a message to populate metrics.</p>
			</div>
		);
	}

	return (
		<div className="agentic-metrics agentic-metrics--hero">
			<div className="agentic-metrics__grid">
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Runs</span>
					<strong>{dash.totalRuns}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Success rate</span>
					<strong>{pct(dash.successRate)}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Avg duration</span>
					<strong>{formatMs(dash.avgDurationMs)}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Avg tools / run</span>
					<strong>{dash.avgToolCalls.toFixed(1)}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Tool error rate</span>
					<strong>{pct(dash.toolErrorRate)}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Failed</span>
					<strong>{dash.failedRuns}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Edit success</span>
					<strong>{pct(dash.editSuccessRate)}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Stalls</span>
					<strong>{dash.stallRuns}</strong>
				</div>
				<div className="agentic-metrics__stat">
					<span className="agentic-metrics__label">Avg edits / run</span>
					<strong>{dash.avgSuccessfulEdits.toFixed(1)}</strong>
				</div>
			</div>

			{dash.completionKindCounts.length > 0 && (
				<div className="agentic-metrics__section">
					<h4>Outcomes</h4>
					<ul className="agentic-metrics__list">
						{dash.completionKindCounts.map(row => (
							<li key={row.kind}>
								<span>{row.kind}</span>
								<span>{row.count}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{dash.intentCounts.length > 0 && (
				<div className="agentic-metrics__section">
					<h4>Intents</h4>
					<ul className="agentic-metrics__list">
						{dash.intentCounts.slice(0, 6).map(row => (
							<li key={row.intent}>
								<span>{row.intent.replace(/_/g, ' ')}</span>
								<span>{row.count}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{dash.toolUsage.length > 0 && (
				<div className="agentic-metrics__section">
					<h4>Top tools</h4>
					<ul className="agentic-metrics__list">
						{dash.toolUsage.slice(0, 8).map(row => (
							<li key={row.name}>
								<span>{row.name}</span>
								<span>{row.count}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="agentic-metrics__section">
				<h4>Recent runs</h4>
				<ul className="agentic-metrics__runs">
					{dash.recentRuns.slice(0, 10).map(run => (
						<li key={run.runId} className={`agentic-metrics__run agentic-metrics__run--${run.status}`}>
							<div className="agentic-metrics__run-head">
								<span>{run.intent?.replace(/_/g, ' ') ?? 'run'}</span>
								<span>{run.status}</span>
							</div>
							<div className="agentic-metrics__run-meta">
								{run.durationMs !== undefined && <span>{formatMs(run.durationMs)}</span>}
								<span>{run.toolCalls} tools</span>
								{run.successfulEdits > 0 && <span>{run.successfulEdits} edit(s)</span>}
								{run.completionKind && <span>{run.completionKind}</span>}
							</div>
							{run.userMessagePreview && (
								<p className="agentic-metrics__run-preview">{run.userMessagePreview}</p>
							)}
						</li>
					))}
				</ul>
			</div>

			<button
				type="button"
				className="agentic-btn agentic-btn-ghost agentic-btn--sm"
				onClick={() => getAgentMetricsService().clear()}
			>
				Clear metrics
			</button>
		</div>
	);
}
