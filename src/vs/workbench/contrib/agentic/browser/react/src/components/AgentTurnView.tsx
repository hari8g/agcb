import React from 'react';
import type { ChatMessage } from '../../../../common/agenticTypes.js';
import { ReasoningPanel } from './ReasoningPanel.js';
import { EditDiffCard } from './EditDiffCard.js';
import { LiveStreamPanel } from './LiveStreamPanel.js';
import { WorkflowSummaryPanel } from './WorkflowSummaryPanel.js';
import { DecisionBlock } from './DecisionBlock.js';
import { PlanProposalPanel } from './PlanProposalPanel.js';
import { parsePlanProposalContent } from '../../../../common/planProposalContent.js';

function exploreSummary(toolCalls: ChatMessage['toolCalls']): string | null {
	if (!toolCalls?.length) {
		return null;
	}
	let reads = 0;
	let searches = 0;
	let edits = 0;
	for (const tc of toolCalls) {
		if (tc.name === 'read_file') {
			reads++;
		} else if (['grep', 'search_files', 'list_files', 'list_workspace', 'get_symbols'].includes(tc.name)) {
			searches++;
		} else if (tc.name === 'propose_file_edit' || tc.name === 'apply_file_edit') {
			edits++;
		}
	}
	const parts: string[] = [];
	if (reads) {
		parts.push(`${reads} file${reads === 1 ? '' : 's'}`);
	}
	if (searches) {
		parts.push(`${searches} search${searches === 1 ? '' : 'es'}`);
	}
	if (edits) {
		parts.push(`${edits} edit${edits === 1 ? '' : 's'}`);
	}
	if (!parts.length) {
		return null;
	}
	return `Explored ${parts.join(', ')}`;
}

function cleanAnswer(content: string): string {
	return content
		.replace(/^## Workflow summary[\s\S]*?---\s*/m, '')
		.replace(/^\*\*Status:\*\*[^\n]*\n+/m, '')
		.trim();
}

/** Cursor-style assistant turn: Thought → explore → inline diffs → short answer. */
export function AgentTurnView({
	message,
	isLive,
	voidLike,
}: {
	message: ChatMessage;
	isLive?: boolean;
	voidLike?: boolean;
}) {
	const toolCalls = message.toolCalls ?? [];
	const editByPath = new Map<string, typeof toolCalls[0]>();
	for (const tc of toolCalls) {
		if (tc.name === 'propose_file_edit' || tc.name === 'apply_file_edit') {
			const p = String(tc.arguments.path ?? tc.id);
			editByPath.set(p, tc);
		}
	}
	const editCalls = [...editByPath.values()];
	const explore = exploreSummary(toolCalls);
	const answer = cleanAnswer(message.content);
	const planProposal = answer ? parsePlanProposalContent(answer) : null;
	const showSummary = !voidLike
		&& message.workflowSummary
		&& (message.state === 'complete' || message.state === 'error');

	return (
		<article className={`agentic-turn${isLive ? ' agentic-turn--live' : ''}${voidLike ? ' agentic-turn--void-like' : ''}`}>
			{!voidLike && <ReasoningPanel message={message} isLive={isLive} />}
			{!voidLike && <LiveStreamPanel message={message} runActive={!!isLive} />}
			{message.decision && !message.decision.resolved && message.decision.kind !== 'plan_exploration' && (
				<DecisionBlock decision={message.decision} />
			)}
			{voidLike && isLive && (message.content || message.streamRaw) && (
				<p className="agentic-turn__streaming">{(message.content || message.streamRaw || '').trim()}</p>
			)}
			{!voidLike && explore && <div className="agentic-turn__explore">{explore}</div>}
			{editCalls.map(tc => (
				<EditDiffCard key={tc.id} toolCall={tc} />
			))}
			{planProposal && message.state !== 'thinking' ? (
				<PlanProposalPanel proposal={planProposal} decision={message.decision} />
			) : (
				answer && message.state !== 'thinking' && (
					<p className="agentic-turn__answer">{answer}</p>
				)
			)}
			{showSummary && <WorkflowSummaryPanel summary={message.workflowSummary!} />}
			{message.state === 'error' && !answer && (
				<p className="agentic-turn__error">{message.content || 'Something went wrong.'}</p>
			)}
		</article>
	);
}
