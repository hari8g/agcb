/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import '../styles.css';
import React from 'react';
import { AgenticChatTabPane } from './AgenticChatTabPane.js';
import ErrorBoundary from './ErrorBoundary.js';
import { useIsDark } from '../util/services.js';

/** Agentic AI sidebar — conversational agent (full panel). */
export const Sidebar = ({ className }: { className: string }) => {
	const isDark = useIsDark();
	return (
		<div className={className} style={{ width: '100%', height: '100%', minHeight: 0 }}>
			<div
				className={`@@void-scope void-aux-shell void-aux-shell--chat-only ${isDark ? 'dark' : ''}`}
				style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
			>
				<ErrorBoundary>
					<AgenticChatTabPane />
				</ErrorBoundary>
			</div>
		</div>
	);
};
