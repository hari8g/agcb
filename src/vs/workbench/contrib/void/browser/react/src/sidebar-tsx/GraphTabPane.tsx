/*--------------------------------------------------------------------------------------
 *  Codebase knowledge graph tab (repository-scoped)
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';
import { mountCodebaseGraphView } from '../../../../../agentic/browser/react/out/agentic-tsx/index.js';
import { getWorkbenchAccessor } from '../util/services.js';

export function GraphTabPane() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		let mounted: { dispose?: () => void } | undefined;
		try {
			mounted = mountCodebaseGraphView(el, getWorkbenchAccessor());
		} catch (e) {
			console.error('[GraphTabPane] failed to mount graph', e);
		}
		return () => mounted?.dispose?.();
	}, []);

	return (
		<div
			ref={ref}
			className="void-graph-tab-mount agentic-root"
			style={{ width: '100%', height: '100%', minHeight: 0 }}
		/>
	);
}
