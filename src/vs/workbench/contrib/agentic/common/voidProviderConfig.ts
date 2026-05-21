/*--------------------------------------------------------------------------------------
 *  Agentic AI — Void provider credentials (browser → main, same as Void Chat)
 *--------------------------------------------------------------------------------------*/

import type { ModelSelectionOptions, ProviderName, SettingsOfProvider } from '../../void/common/voidSettingsTypes.js';

export interface VoidProviderConfig {
	providerName: ProviderName;
	modelName: string;
	settingsOfProvider: SettingsOfProvider;
	modelSelectionOptions?: ModelSelectionOptions;
}
