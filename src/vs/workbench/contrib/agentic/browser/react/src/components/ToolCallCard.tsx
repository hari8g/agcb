import React from 'react';
import type { ToolCall } from '../../../../common/agenticTypes.js';

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
	const argsPreview = JSON.stringify(toolCall.arguments).slice(0, 200);
	return (
		<div className="agentic-tool-card">
			<div><strong>{toolCall.name}</strong> · {toolCall.status}</div>
			<div style={{ opacity: 0.8, marginTop: 4 }}>{argsPreview}</div>
			{toolCall.resultPreview && (
				<pre style={{ marginTop: 6, fontSize: 11, whiteSpace: 'pre-wrap' }}>{toolCall.resultPreview.slice(0, 500)}</pre>
			)}
			{toolCall.error && <div style={{ color: 'var(--vscode-errorForeground)' }}>{toolCall.error}</div>}
		</div>
	);
}
