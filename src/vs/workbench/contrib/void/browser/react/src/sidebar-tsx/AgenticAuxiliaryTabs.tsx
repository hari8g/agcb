/*--------------------------------------------------------------------------------------
 *  Agentic AI auxiliary shell — Chat (agentic) + Composer (JIRA workflow)
 *--------------------------------------------------------------------------------------*/

import React from 'react';
import { AgenticChatTabPane } from './AgenticChatTabPane.js';
import { JiraTabPane } from './JiraTabPane.js';
import { type AgenticAuxTab, useAgenticAuxTab } from './agenticAuxTab.js';
import ErrorBoundary from './ErrorBoundary.js';
import { useIsDark } from '../util/services.js';

const AUX_TAB_ORDER: AgenticAuxTab[] = ['chat', 'composer'];

const TAB_LABELS: Record<AgenticAuxTab, string> = {
	chat: 'Chat',
	composer: 'Composer',
};

export function AgenticAuxiliaryTabs() {
	const isDark = useIsDark();
	const [tab, setTab] = useAgenticAuxTab();

	return (
		<div className={`@@void-scope void-aux-shell ${isDark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
			<nav className="void-aux-tabs" role="tablist" aria-label="Agentic AI">
				{AUX_TAB_ORDER.map(id => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						className={`void-aux-tabs__btn${tab === id ? ' void-aux-tabs__btn--active' : ''}`}
						onClick={() => setTab(id)}
					>
						{TAB_LABELS[id]}
					</button>
				))}
			</nav>
			<div className="void-aux-tab-content">
				<ErrorBoundary>
					{tab === 'chat' && <AgenticChatTabPane />}
					{tab === 'composer' && <JiraTabPane />}
				</ErrorBoundary>
			</div>
		</div>
	);
}
