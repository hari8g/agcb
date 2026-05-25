import React from 'react';
import type { ChatMessage as ChatMessageType } from '../../../../common/agenticTypes.js';
import { JiraChatBlock } from './jira/JiraChatBlock.js';
import { AgentTurnView } from './AgentTurnView.js';

export function ChatMessage({
	message,
	isLive,
	voidLike,
}: {
	message: ChatMessageType;
	isLive?: boolean;
	voidLike?: boolean;
}) {
	const isUser = message.role === 'user';
	const hasJira = !!message.jiraChat;

	if (isUser) {
		const trimmed = message.content.trim();
		if (/^(tickets|show open jira|jira)$/i.test(trimmed)) {
			return null;
		}
		if (/^\[Orchestrator\]/i.test(trimmed) || /^\[Execute approved plan\]/i.test(trimmed)) {
			return null;
		}
		return (
			<article className="agentic-chat-turn agentic-chat-turn--user">
				<div className="agentic-chat-bubble agentic-chat-bubble--user">{message.content}</div>
			</article>
		);
	}

	if (hasJira) {
		return (
			<article className="agentic-chat-turn agentic-chat-turn--assistant">
				<JiraChatBlock ui={message.jiraChat!} />
			</article>
		);
	}

	return <AgentTurnView message={message} isLive={isLive} voidLike={voidLike} />;
}
