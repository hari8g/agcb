import React from 'react';
import type { ChatMessage as ChatMessageType } from '../../../../common/agenticTypes.js';
import { ActivityFeed } from './ActivityFeed.js';
import { ToolCallCard } from './ToolCallCard.js';
import { JiraChatBlock } from './jira/JiraChatBlock.js';

export function ChatMessage({
	message,
	isLive,
}: {
	message: ChatMessageType;
	isLive?: boolean;
}) {
	const isUser = message.role === 'user';

	if (isUser) {
		return (
			<div className="agentic-turn">
				<div className="agentic-card agentic-card-user">
					<div className="agentic-role">You</div>
					<div className="agentic-message-body">{message.content}</div>
				</div>
			</div>
		);
	}

	const hasJira = !!message.jiraChat;
	const showAnswer = message.content.length > 0 || message.state === 'complete' || hasJira;
	const isStreamingAnswer = isLive && message.state === 'streaming';

	return (
		<div className="agentic-turn">
			<ActivityFeed message={message} />
			{(showAnswer || (isLive && message.state !== 'error' && message.state !== 'streaming')) && (
				<div className="agentic-card agentic-card-assistant">
					<div className="agentic-role">Assistant</div>
					{(message.content || isLive) && message.state !== 'error' && (
						<div className="agentic-message-body">
							{message.content || (isLive ? (
								<span className="agentic-answer-placeholder">Formulating response…</span>
							) : null)}
							{isStreamingAnswer && <span className="agentic-answer-cursor" aria-hidden />}
						</div>
					)}
					{hasJira && <JiraChatBlock ui={message.jiraChat!} />}
				</div>
			)}
			{message.toolCalls?.map(tc => (
				<ToolCallCard key={tc.id} toolCall={tc} />
			))}
			{message.state === 'error' && (
				<div className="agentic-error-banner">{message.content || 'Something went wrong.'}</div>
			)}
		</div>
	);
}
