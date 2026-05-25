import React, { useEffect, useState } from 'react';
import type { AgenticSettings } from '../../../../common/agenticSettingsTypes.js';
import { getAgenticSettingsService } from '../util/agenticServices.js';
import { AgentCapabilitiesPanel } from './AgentCapabilitiesPanel.js';
import { AgentMetricsPanel } from './AgentMetricsPanel.js';
import { SessionMemoryPanel } from './SessionMemoryPanel.js';

export function AgenticSettingsPanel(props: { open: boolean; onClose: () => void }) {
	const [settings, setSettings] = useState<AgenticSettings | null>(null);

	useEffect(() => {
		if (props.open) {
			setSettings({ ...getAgenticSettingsService().settings });
		}
	}, [props.open]);

	if (!props.open || !settings) {
		return null;
	}

	const save = (partial: Partial<AgenticSettings>) => {
		const svc = getAgenticSettingsService();
		svc.updateSettings(partial);
		setSettings({ ...svc.settings });
	};

	return (
		<div className="agentic-settings-drawer">
			<div className="agentic-settings-drawer__head">
				<strong>Agent settings</strong>
				<button type="button" className="agentic-btn agentic-btn-ghost agentic-btn--sm" onClick={props.onClose}>
					Close
				</button>
			</div>
			<div className="agentic-settings-drawer__body">
				<AgentCapabilitiesPanel settings={settings} onChange={save} />

				<hr className="agentic-settings-divider" />

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
					Approval mode
					<select
						value={settings.approvalMode}
						onChange={e => save({ approvalMode: e.target.value as AgenticSettings['approvalMode'] })}
					>
						<option value="cautious">Cautious</option>
						<option value="balanced">Balanced</option>
						<option value="fast">Fast</option>
					</select>
				</label>
				<label>
					Max agent turns
					<input
						type="number"
						min={12}
						max={80}
						step={4}
						value={settings.maxAgentTurns}
						onChange={e => save({ maxAgentTurns: Math.min(80, Math.max(12, Number(e.target.value) || 40)) })}
					/>
					<span className="agentic-settings-hint">
						Model loops per message (Pro uses ≥40). Orchestrator nudges are free.
					</span>
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.enableJiraWorkflow}
						onChange={e => save({ enableJiraWorkflow: e.target.checked })}
					/>
					Auto-detect JIRA keys in messages
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.requireApprovalForEdits}
						onChange={e => save({ requireApprovalForEdits: e.target.checked })}
					/>
					Require approval for edits
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.revealTouchedFilesInEditor}
						onChange={e => save({ revealTouchedFilesInEditor: e.target.checked })}
					/>
					Open files in editor when the agent reads or edits them
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.autoContinueOnStall}
						onChange={e => save({ autoContinueOnStall: e.target.checked })}
					/>
					Auto-continue when agent stops without running tools
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.enableKnowledgeGraph}
						onChange={e => save({ enableKnowledgeGraph: e.target.checked })}
					/>
					Build architecture map before LLM (reduces tokens on large repos)
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.compactActiveFileInContext}
						onChange={e => save({ compactActiveFileInContext: e.target.checked })}
					/>
					Compact active file when map + search already cover the task
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.dynamicContextDiscovery}
						onChange={e => save({ dynamicContextDiscovery: e.target.checked })}
					/>
					Dynamic context discovery (agent pulls context via tools — Cursor-style)
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.useWorkspaceRules}
						onChange={e => save({ useWorkspaceRules: e.target.checked })}
					/>
					Apply .voidrules / .cursorrules team rules to agent
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.enableSessionMemory}
						onChange={e => save({ enableSessionMemory: e.target.checked })}
					/>
					Session memory — remember preferences and project facts across chats in this workspace
				</label>

				<hr className="agentic-settings-divider" />
				<p className="agentic-settings-section-title">Developer</p>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.debugWorkflowToDevTools}
						onChange={e => save({ debugWorkflowToDevTools: e.target.checked })}
					/>
					Log agent workflow to DevTools console (Help → Toggle Developer Tools)
				</label>
				<label className="agentic-checkbox">
					<input
						type="checkbox"
						checked={settings.debugWorkflowVerbose}
						disabled={!settings.debugWorkflowToDevTools}
						onChange={e => save({ debugWorkflowVerbose: e.target.checked })}
					/>
					Verbose DevTools logs (include model stream deltas)
				</label>

				{settings.enableSessionMemory && (
					<>
						<strong className="agentic-settings-section-title">Session memory</strong>
						<p className="agentic-settings-hint">
							Facts injected into the agent system prompt for this workspace.
						</p>
						<SessionMemoryPanel />
					</>
				)}

				<hr className="agentic-settings-divider" />

				<strong className="agentic-settings-section-title">Run metrics</strong>
				<p className="agentic-settings-hint">Session stats for agent runs in this workspace (resets when cleared).</p>
				<AgentMetricsPanel />
			</div>
		</div>
	);
}
