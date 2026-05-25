import React from 'react';
import type { ToolCall } from '../../../../common/agenticTypes.js';
import { getChatService } from '../util/agenticServices.js';

const FILE_TOOLS = new Set(['read_file', 'propose_file_edit', 'apply_file_edit']);

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
	const argsPreview = JSON.stringify(toolCall.arguments).slice(0, 200);
	const filePath = FILE_TOOLS.has(toolCall.name)
		? String(toolCall.arguments.path ?? '').trim()
		: '';
	return (
		<div className="agentic-tool-card">
			<div className="agentic-tool-card__head">
				<span><strong>{toolCall.name}</strong> · {toolCall.status}</span>
				{filePath && (
					<button
						type="button"
						className="agentic-tool-card__open"
						title={`Open ${filePath}`}
						onClick={() => void getChatService().openTouchedFile(filePath)}
					>
						Open file
					</button>
				)}
			</div>
			<div style={{ opacity: 0.8, marginTop: 4 }}>{argsPreview}</div>
			{toolCall.resultPreview && (
				<pre style={{ marginTop: 6, fontSize: 11, whiteSpace: 'pre-wrap' }}>{toolCall.resultPreview.slice(0, 500)}</pre>
			)}
			{toolCall.error && <div style={{ color: 'var(--vscode-errorForeground)' }}>{toolCall.error}</div>}
		</div>
	);
}
