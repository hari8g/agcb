/*--------------------------------------------------------------------------------------
 *  Agentic AI — React mount helper
 *--------------------------------------------------------------------------------------*/

import type { ReactNode } from 'react';
import { jsx } from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { ServicesAccessor } from '../../../../../../../editor/browser/editorExtensions.js';
import { FileAccess } from '../../../../../../../base/common/network.js';
import { IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { _registerAgenticServices } from './agenticServices.js';

const AGENTIC_STYLESHEET_ID = 'agentic-workbench-styles';

function isServicesAccessor(value: unknown): value is ServicesAccessor {
	return typeof value === 'object' && value !== null && typeof (value as ServicesAccessor).get === 'function';
}

export function ensureAgenticStylesheet(): void {
	if (typeof document === 'undefined' || document.getElementById(AGENTIC_STYLESHEET_ID)) {
		return;
	}
	const link = document.createElement('link');
	link.id = AGENTIC_STYLESHEET_ID;
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.href = FileAccess.asBrowserUri('vs/workbench/contrib/agentic/browser/styles/agentic.css').toString(true);
	document.head.appendChild(link);
}

export const mountFnGenerator = (Component: (params?: Record<string, unknown>) => ReactNode) =>
	(rootElement: HTMLElement, accessorOrProps?: ServicesAccessor | Record<string, unknown>, props?: Record<string, unknown>) => {
		if (typeof document === 'undefined') {
			console.error('agentic mountFnGenerator: document was undefined');
			return { rerender: () => { }, dispose: () => { } };
		}

		let accessor: ServicesAccessor | undefined;
		let resolvedProps: Record<string, unknown> | undefined;
		if (isServicesAccessor(accessorOrProps)) {
			accessor = accessorOrProps;
			resolvedProps = props;
		} else {
			resolvedProps = accessorOrProps;
		}

		ensureAgenticStylesheet();
		const registrationDisposables: IDisposable[] = accessor ? _registerAgenticServices(accessor) : [];
		const root = createRoot(rootElement);
		const rerender = (p?: Record<string, unknown>) => {
			root.render(jsx(Component, p ?? {}));
		};
		const dispose = () => {
			root.unmount();
			registrationDisposables.forEach(d => d.dispose());
		};
		rerender(resolvedProps);
		return { rerender, dispose };
	};
