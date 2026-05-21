/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import {
	Extensions as ViewContainerExtensions, IViewContainersRegistry,
	ViewContainerLocation, IViewsRegistry, Extensions as ViewExtensions,
} from '../../../common/views.js';
import * as nls from '../../../../nls.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { mountComposer } from './react/out/composer-tsx/index.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';

export const VOID_COMPOSER_VIEW_CONTAINER_ID = 'workbench.view.voidComposer';
export const VOID_COMPOSER_VIEW_ID = 'workbench.view.voidComposer.panel';

class ComposerViewPane extends ViewPane {
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
		parent.style.userSelect = 'text';
		this.instantiationService.invokeFunction(accessor => {
			const disposeFn = mountComposer(parent, accessor)?.dispose;
			this._register(toDisposable(() => disposeFn?.()));
		});
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.element.style.height = `${height}px`;
		this.element.style.width = `${width}px`;
	}
}

const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const composerContainer = viewContainerRegistry.registerViewContainer({
	id: VOID_COMPOSER_VIEW_CONTAINER_ID,
	title: nls.localize2('voidComposerContainer', 'Composer'),
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [VOID_COMPOSER_VIEW_CONTAINER_ID, {
		mergeViewWithContainerWhenSingleView: true,
		orientation: Orientation.VERTICAL,
	}]),
	hideIfEmpty: false,
	order: 2,
	rejectAddedViews: true,
	icon: Codicon.layers,
}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
viewsRegistry.registerViews([{
	id: VOID_COMPOSER_VIEW_ID,
	hideByDefault: false,
	name: nls.localize2('voidComposer', 'Composer'),
	ctorDescriptor: new SyncDescriptor(ComposerViewPane),
	canToggleVisibility: true,
	canMoveView: false,
	weight: 60,
	order: 2,
}], composerContainer);

export const VOID_OPEN_COMPOSER_ACTION_ID = 'void.openComposer';
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: VOID_OPEN_COMPOSER_ACTION_ID,
			title: nls.localize2('voidOpenComposer', 'Open Agentic_MPS Composer'),
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
				weight: 200,
			},
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IViewsService).openViewContainer(VOID_COMPOSER_VIEW_CONTAINER_ID);
	}
});
