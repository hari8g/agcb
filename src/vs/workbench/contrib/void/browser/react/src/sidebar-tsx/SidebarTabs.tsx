/*--------------------------------------------------------------------------------------
 *  Agentic sidebar — Chat + Codebase Graph (when a folder is open)
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { AgenticChatTabPane } from './AgenticChatTabPane.js';
import { GraphTabPane } from './GraphTabPane.js';
import ErrorBoundary from './ErrorBoundary.js';
import { useHasWorkspace, useIsDark } from '../util/services.js';

export type SidebarTab = 'chat' | 'graph';

const SIDEBAR_TAB_KEY = 'void-sidebar-tab';

function readStoredTab(): SidebarTab {
	try {
		const v = sessionStorage.getItem(SIDEBAR_TAB_KEY);
		return v === 'graph' ? 'graph' : 'chat';
	} catch {
		return 'chat';
	}
}

function storeTab(tab: SidebarTab): void {
	try {
		sessionStorage.setItem(SIDEBAR_TAB_KEY, tab);
	} catch {
		// ignore
	}
}

export function SidebarTabs() {
	const isDark = useIsDark();
	const hasWorkspace = useHasWorkspace();
	const [tab, setTab] = useState<SidebarTab>(readStoredTab);

	useEffect(() => {
		storeTab(tab);
	}, [tab]);

	// Keep chat as the default — graph is secondary (optional tab).
	useEffect(() => {
		if (!hasWorkspace && tab === 'graph') {
			setTab('chat');
		}
	}, [hasWorkspace, tab]);

	const tabs: { id: SidebarTab; label: string }[] = [{ id: 'chat', label: 'Chat' }];
	if (hasWorkspace) {
		tabs.push({ id: 'graph', label: 'Graph' });
	}

	return (
		<div className={`@@void-scope void-aux-shell ${isDark ? 'dark' : ''}`} style={{ width: '100%', height: '100%' }}>
			<nav className="void-aux-tabs" role="tablist" aria-label="Agentic sidebar">
				{tabs.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={tab === id}
						className={`void-aux-tabs__btn${tab === id ? ' void-aux-tabs__btn--active' : ''}`}
						onClick={() => setTab(id)}
					>
						{label}
					</button>
				))}
			</nav>
			<div className="void-aux-tab-content">
				<ErrorBoundary>
					<div
						className="void-aux-tab-pane"
						style={{ display: tab === 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0 }}
					>
						<AgenticChatTabPane />
					</div>
					{hasWorkspace && (
						<div
							className="void-aux-tab-pane"
							style={{ display: tab === 'graph' ? 'flex' : 'none', flex: 1, minHeight: 0 }}
						>
							<GraphTabPane />
						</div>
					)}
				</ErrorBoundary>
			</div>
		</div>
	);
}
