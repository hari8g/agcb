import React, { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../../../common/agenticTypes.js';
import { splitStreamContent } from '../../../../common/streamContent.js';

/** Live token stream while the model is working (Cursor-style). */
export function LiveStreamPanel({
	message,
	runActive = false,
}: {
	message: ChatMessage | null;
	runActive?: boolean;
}) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}, [message?.streamRaw, message?.content]);

	if (!message || message.role !== 'assistant' || !runActive) {
		return null;
	}

	if (message.state === 'complete' || message.state === 'error') {
		return null;
	}

	const raw = message.streamRaw ?? '';
	const parts = raw ? splitStreamContent(raw) : null;
	const liveText = parts?.working || parts?.answer || message.content || '';

	if (message.state === 'waiting_for_tool') {
		return (
			<div className="agentic-live-stream agentic-live-stream--tool">
				<span className="agentic-live-stream__pulse" aria-hidden />
				<span className="agentic-live-stream__label">Running tool…</span>
			</div>
		);
	}

	const isStreaming = message.state === 'streaming' || message.state === 'thinking';
	if (!isStreaming && !liveText) {
		return null;
	}

	return (
		<div className="agentic-live-stream">
			<div className="agentic-live-stream__body">
				{liveText || (
					<span className="agentic-live-stream__placeholder">Working…</span>
				)}
				{isStreaming && liveText && (
					<span className="agentic-live-stream__cursor" aria-hidden />
				)}
			</div>
			<div ref={bottomRef} />
		</div>
	);
}
