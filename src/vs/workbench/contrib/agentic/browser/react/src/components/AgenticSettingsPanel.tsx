import React, { useState } from 'react';
import type { AgenticSettings } from '../../../../common/agenticSettingsTypes.js';
import { getAgenticSettingsService } from '../util/agenticServices.js';

export function AgenticSettingsPanel() {
	const [open, setOpen] = useState(false);
	const [settings, setSettings] = useState<AgenticSettings | null>(null);

	const load = () => {
		const svc = getAgenticSettingsService();
		setSettings({ ...svc.settings });
	};

	if (!open) {
		return (
			<button type="button" className="agentic-btn agentic-btn-ghost" onClick={() => { load(); setOpen(true); }}>
				Runtime settings
			</button>
		);
	}

	if (!settings) {
		load();
		return null;
	}

	const save = (partial: Partial<AgenticSettings>) => {
		const svc = getAgenticSettingsService();
		svc.updateSettings(partial);
		setSettings({ ...svc.settings });
	};

	return (
		<div className="agentic-settings-panel">
			<div className="agentic-settings-header">
				<strong>Agentic runtime</strong>
				<button type="button" className="agentic-btn agentic-btn-ghost" onClick={() => setOpen(false)}>Close</button>
			</div>
			<label>
				Provider
				<select
					value={settings.providerType}
					onChange={e => save({ providerType: e.target.value as AgenticSettings['providerType'] })}
				>
					<option value="void">Agentic_MPS Chat model</option>
					<option value="openai_compatible">OpenAI-compatible (env key)</option>
					<option value="external">External gateway</option>
				</select>
			</label>
			<label>
				Runtime mode
				<select
					value={settings.runtimeMode}
					onChange={e => save({ runtimeMode: e.target.value as AgenticSettings['runtimeMode'] })}
				>
					<option value="local_provider">Local provider</option>
					<option value="external_agent_runtime">External runtime</option>
				</select>
			</label>
			<label>
				Gateway URL
				<input
					type="text"
					placeholder="dev://local or https://gateway.example.com"
					value={settings.runtimeBaseUrl}
					onChange={e => save({ runtimeBaseUrl: e.target.value })}
				/>
			</label>
			<label>
				API key env var
				<input
					type="text"
					value={settings.apiKeyEnvVar}
					onChange={e => save({ apiKeyEnvVar: e.target.value })}
				/>
			</label>
			<label>
				Model (OpenAI / external)
				<input type="text" value={settings.model} onChange={e => save({ model: e.target.value })} />
			</label>
			<label className="agentic-checkbox">
				<input
					type="checkbox"
					checked={settings.autoRunReadOnlyTools}
					onChange={e => save({ autoRunReadOnlyTools: e.target.checked })}
				/>
				Auto-run read-only tools
			</label>
			<label className="agentic-checkbox">
				<input
					type="checkbox"
					checked={settings.requireApprovalForEdits}
					onChange={e => save({ requireApprovalForEdits: e.target.checked })}
				/>
				Require approval for edits & terminal
			</label>
			<label className="agentic-checkbox">
				<input
					type="checkbox"
					checked={settings.enableJiraWorkflow}
					onChange={e => save({ enableJiraWorkflow: e.target.checked })}
				/>
				Enable JIRA workflow (auto-detect PROJ-123 keys)
			</label>
			<label className="agentic-checkbox">
				<input
					type="checkbox"
					checked={settings.requireApprovalForMcpTools}
					onChange={e => save({ requireApprovalForMcpTools: e.target.checked })}
				/>
				Require approval for MCP / JIRA tools
			</label>
			<label>
				Max agent turns
				<input
					type="number"
					min={1}
					max={20}
					value={settings.maxAgentTurns}
					onChange={e => save({ maxAgentTurns: Number(e.target.value) || 8 })}
				/>
			</label>
		</div>
	);
}
