import React, { useState } from 'react';
import type { ChatMessage } from '../../../../common/agenticTypes.js';

/** Cursor-style "Thought" block — collapsed by default when done. */
export function ReasoningPanel({
	message,
	isLive,
}: {
	message: ChatMessage;
	isLive?: boolean;
}) {
	const isComplete = message.state === 'complete' || message.state === 'error';
	const [collapsed, setCollapsed] = useState(true);
	const rawReasoning = (message.activityLines ?? []).filter(l => l.kind === 'reasoning');
	const reasoningLines: typeof rawReasoning = [];
	let prev = '';
	for (const line of rawReasoning) {
		const t = line.text.replace(/^Reasoning:\s*/i, '').trim();
		if (t && t === prev) {
			continue;
		}
		prev = t;
		reasoningLines.push(line);
	}

	if (!reasoningLines.length) {
		return null;
	}

	const isActive = isLive && message.state && !['complete', 'error'].includes(message.state);
	const preview = reasoningLines[reasoningLines.length - 1]?.text.replace(/^Reasoning:\s*/i, '') ?? '';
	const started = message.createdAt;
	const durationSec = isComplete && reasoningLines.length
		? Math.max(1, Math.round((Date.now() - started) / 1000))
		: null;

	return (
		<div className={`agentic-thought${isActive ? ' agentic-thought--live' : ''}`}>
			<button
				type="button"
				className="agentic-thought__toggle"
				onClick={() => setCollapsed(c => !c)}
				aria-expanded={!collapsed}
			>
				<span className="agentic-thought__title">
					{isActive ? 'Thinking…' : durationSec ? `Thought for ${durationSec}s` : 'Thought'}
				</span>
				{collapsed && preview && (
					<span className="agentic-thought__preview">{preview.slice(0, 140)}{preview.length > 140 ? '…' : ''}</span>
				)}
				<span className="agentic-thought__chevron">{collapsed ? '▸' : '▾'}</span>
			</button>
			{!collapsed && (
				<div className="agentic-thought__body">
					{reasoningLines.map(line => (
						<div key={line.id} className="agentic-thought__line">
							{line.text.replace(/^Reasoning:\s*/i, '')}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
