/*--------------------------------------------------------------------------------------
 *  Agentic AI — React mount helper
 *--------------------------------------------------------------------------------------*/

import type { ReactNode } from 'react';
import { jsx } from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { _registerAgenticServices } from './agenticServices.js';

export const mountFnGenerator = (Component: (params?: Record<string, unknown>) => ReactNode) =>
	(rootElement: HTMLElement, accessor: ServicesAccessor, props?: Record<string, unknown>) => {
		if (typeof document === 'undefined') {
			console.error('agentic mountFnGenerator: document was undefined');
			return { rerender: () => { }, dispose: () => { } };
		}

		const disposables = _registerAgenticServices(accessor);
		const root = createRoot(rootElement);
		const rerender = (p?: Record<string, unknown>) => {
			root.render(jsx(Component, p ?? {}));
		};
		const dispose = () => {
			root.unmount();
			disposables.forEach(d => d.dispose());
		};
		rerender(props);
		return { rerender, dispose };
	};
