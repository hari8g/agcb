/*--------------------------------------------------------------------------------------
 *  Agentic AI — sidebar view pane
 *--------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import {
	Extensions as ViewContainerExtensions,
	IViewContainersRegistry,
	ViewContainerLocation,
	IViewsRegistry,
	Extensions as ViewExtensions,
	IViewDescriptorService,
} from '../../../common/views.js';
import * as nls from '../../../../nls.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { mountAgenticView } from './react/out/agentic-tsx/index.js';

const AGENTIC_STYLESHEET_ID = 'agentic-workbench-styles';

function ensureAgenticStylesheet(): void {
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

export const AGENTIC_VIEW_CONTAINER_ID = 'workbench.view.agentic';
export const AGENTIC_VIEW_ID = 'workbench.view.agentic.chat';

class AgenticViewPane extends ViewPane {
	constructor(
		options: IViewPaneOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(parent: HTMLElement): void {
		super.renderBody(parent);
		ensureAgenticStylesheet();
		parent.style.userSelect = 'text';
		this.instantiationService.invokeFunction(accessor => {
			const mounted = mountAgenticView(parent, accessor);
			this._register(toDisposable(() => mounted?.dispose?.()));
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.element.style.height = `${height}px`;
		this.element.style.width = `${width}px`;
	}
}

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const container = viewContainerRegistry.registerViewContainer({
	id: AGENTIC_VIEW_CONTAINER_ID,
	title: nls.localize2('agenticContainer', 'Agentic AI'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENTIC_VIEW_CONTAINER_ID, {
		mergeViewWithContainerWhenSingleView: true,
		orientation: Orientation.HORIZONTAL,
	}]),
	hideIfEmpty: false,
	order: 2,
	rejectAddedViews: true,
	icon: Codicon.sparkle,
}, ViewContainerLocation.Sidebar);

const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([{
	id: AGENTIC_VIEW_ID,
	name: nls.localize2('agenticChat', 'Agentic AI'),
	ctorDescriptor: new SyncDescriptor(AgenticViewPane),
	canToggleVisibility: true,
	canMoveView: true,
	order: 1,
}], container);
