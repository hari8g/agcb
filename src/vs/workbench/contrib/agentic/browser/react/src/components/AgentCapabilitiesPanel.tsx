import React from 'react';
import type { AgenticSettings } from '../../../../common/agenticSettingsTypes.js';
import type { AgentCapabilityId, AgentCapabilityProfile } from '../../../../common/agentCapabilities.js';
import {
	AGENT_CAPABILITY_CATALOG,
	AGENT_CAPABILITY_PROFILE_LABELS,
	resolveAgentCapabilities,
	type ResolvedAgentCapabilities,
} from '../../../../common/agentCapabilities.js';

const PROFILE_DEFAULTS_FOR_UI: Record<AgentCapabilityProfile, ResolvedAgentCapabilities> = {
	standard: resolveAgentCapabilities({ capabilityProfile: 'standard', capabilityOverrides: {}, enableJiraWorkflow: true }),
	pro: resolveAgentCapabilities({ capabilityProfile: 'pro', capabilityOverrides: {}, enableJiraWorkflow: true }),
	autonomous: resolveAgentCapabilities({ capabilityProfile: 'autonomous', capabilityOverrides: {}, enableJiraWorkflow: true }),
};

const PROFILES: AgentCapabilityProfile[] = ['standard', 'pro', 'autonomous'];

export function AgentCapabilitiesPanel({
	settings,
	onChange,
}: {
	settings: AgenticSettings;
	onChange: (partial: Partial<AgenticSettings>) => void;
}) {
	const resolved = resolveAgentCapabilities(settings);

	const profileDefaults = PROFILE_DEFAULTS_FOR_UI[settings.capabilityProfile];

	const toggleOverride = (id: AgentCapabilityId, enabled: boolean) => {
		const overrides = { ...settings.capabilityOverrides };
		if (enabled === profileDefaults[id]) {
			delete overrides[id];
		} else {
			overrides[id] = enabled;
		}
		onChange({ capabilityOverrides: overrides });
	};

	const isCapabilityOn = (id: AgentCapabilityId): boolean => resolved[id];

	return (
		<section className="agentic-capabilities">
			<h3 className="agentic-capabilities__heading">Agent capabilities</h3>
			<p className="agentic-capabilities__intro">
				Choose a profile for state-of-the-art behavior. Pro is recommended for daily coding; Autonomous pairs best with Fast approval mode.
			</p>

			<div className="agentic-capabilities__profiles" role="radiogroup" aria-label="Capability profile">
				{PROFILES.map(profile => (
					<button
						key={profile}
						type="button"
						role="radio"
						aria-checked={settings.capabilityProfile === profile}
						className={`agentic-capabilities__profile${settings.capabilityProfile === profile ? ' agentic-capabilities__profile--active' : ''}`}
						onClick={() => onChange({ capabilityProfile: profile, capabilityOverrides: {} })}
					>
						<span className="agentic-capabilities__profile-name">{AGENT_CAPABILITY_PROFILE_LABELS[profile]}</span>
						<span className="agentic-capabilities__profile-desc">
							{profile === 'standard' && 'Focused reads, safe edits, MCP & JIRA'}
							{profile === 'pro' && 'Parallel tools, plan/verify, terminal, deep context'}
							{profile === 'autonomous' && 'Maximum autonomy & longest memory'}
						</span>
					</button>
				))}
			</div>

			<ul className="agentic-capabilities__list">
				{AGENT_CAPABILITY_CATALOG.map(def => {
					const on = isCapabilityOn(def.id);
					return (
						<li key={def.id} className="agentic-capabilities__item">
							<label className="agentic-capabilities__item-label">
								<input
									type="checkbox"
									checked={on}
									disabled={def.id === 'jiraWorkflow' && !settings.enableJiraWorkflow}
									onChange={e => toggleOverride(def.id, e.target.checked)}
								/>
								<span>
									<strong>{def.label}</strong>
									<span className="agentic-capabilities__item-desc">{def.description}</span>
								</span>
							</label>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
