/*--------------------------------------------------------------------------------------
 *  Mount agentic chat inside the auxiliary Chat tab
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useRef } from 'react';
import { mountAgenticView } from '../../../../../agentic/browser/react/out/agentic-tsx/index.js';
import { getWorkbenchAccessor } from '../util/services.js';

export function AgenticChatTabPane() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		let mounted: { dispose?: () => void } | undefined;
		try {
			mounted = mountAgenticView(el, getWorkbenchAccessor());
		} catch (e) {
			console.error('[AgenticChatTabPane] failed to mount agent chat', e);
		}
		return () => mounted?.dispose?.();
	}, []);

	return (
		<div
			ref={ref}
			className="void-agentic-chat-mount"
			style={{ width: '100%', height: '100%', minHeight: 0 }}
		/>
	);
}
