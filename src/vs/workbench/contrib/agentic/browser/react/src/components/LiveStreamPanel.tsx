import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../../../common/agenticTypes.js';

/** Live preview of the in-flight assistant reply (updates as tokens stream). */
export function LiveStreamPanel({ message }: { message: ChatMessage | null }) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [message?.content]);

	if (!message || message.role !== 'assistant') {
		return null;
	}

	const isStreaming = message.state === 'streaming' || message.state === 'thinking' || message.state === 'waiting_for_tool';
	if (!isStreaming && !message.content) {
		return null;
	}

	return (
		<div className="agentic-live-stream">
			<div className="agentic-live-stream__label">
				{message.state === 'streaming' ? 'Live output' : 'Working…'}
			</div>
			<div className="agentic-live-stream__body">
				{message.content || (
					<span className="agentic-live-stream__placeholder">Waiting for first token…</span>
				)}
				{message.state === 'streaming' && (
					<span className="agentic-live-stream__cursor" aria-hidden />
				)}
			</div>
			<div ref={bottomRef} />
		</div>
	);
}
