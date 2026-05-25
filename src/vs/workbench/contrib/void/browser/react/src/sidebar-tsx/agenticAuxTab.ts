/*--------------------------------------------------------------------------------------
 *  Agentic auxiliary bar — tab state (Chat | Composer/JIRA)
 *--------------------------------------------------------------------------------------*/

import { useEffect, useState } from 'react';

export type AgenticAuxTab = 'chat' | 'composer';

/** Legacy tab ids — `jira` opens the Composer (JIRA) tab. */
export type AgenticAuxTabLegacy = AgenticAuxTab | 'jira';

function normalizeAuxTab(tab: string): AgenticAuxTab {
	if (tab === 'composer' || tab === 'jira') {
		return 'composer';
	}
	return 'chat';
}

export const AGENTIC_AUX_TAB_EVENT = 'void-agentic-aux-tab';

let currentTab: AgenticAuxTab = 'chat';
const listeners = new Set<() => void>();

export function getAgenticAuxTab(): AgenticAuxTab {
	return currentTab;
}

export function setAgenticAuxTab(tab: AgenticAuxTab | AgenticAuxTabLegacy): void {
	currentTab = normalizeAuxTab(tab);
	listeners.forEach(l => l());
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent<AgenticAuxTab>(AGENTIC_AUX_TAB_EVENT, { detail: currentTab }));
	}
}

export function useAgenticAuxTab(): [AgenticAuxTab, (tab: AgenticAuxTab) => void] {
	const [, tick] = useState(0);
	useEffect(() => {
		const bump = () => tick(n => n + 1);
		listeners.add(bump);
		const onWindow = (e: Event) => {
			currentTab = normalizeAuxTab((e as CustomEvent<AgenticAuxTabLegacy>).detail);
			bump();
		};
		window.addEventListener(AGENTIC_AUX_TAB_EVENT, onWindow);
		return () => {
			listeners.delete(bump);
			window.removeEventListener(AGENTIC_AUX_TAB_EVENT, onWindow);
		};
	}, []);
	return [currentTab, setAgenticAuxTab];
}
