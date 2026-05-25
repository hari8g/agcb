/*--------------------------------------------------------------------------------------
 *  Mount agentic JIRA panel inside the auxiliary tab shell
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';
import { mountJiraView } from '../../../../../agentic/browser/react/out/agentic-tsx/index.js';
import { getWorkbenchAccessor } from '../util/services.js';

export function JiraTabPane() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		let mounted: { dispose?: () => void } | undefined;
		try {
			mounted = mountJiraView(el, getWorkbenchAccessor());
		} catch (e) {
			console.error('[JiraTabPane] failed to mount JIRA panel', e);
		}
		return () => mounted?.dispose?.();
	}, []);

	return (
		<div
			ref={ref}
			className="void-aux-tab-pane void-aux-tab-pane--composer void-aux-tab-pane__mount"
			style={{ width: '100%', height: '100%', minHeight: 0 }}
		/>
	);
}
