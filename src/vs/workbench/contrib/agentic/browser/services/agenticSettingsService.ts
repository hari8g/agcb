/*--------------------------------------------------------------------------------------
 *  Agentic AI — persisted settings (no secrets stored)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import {
	AGENTIC_SETTINGS_STORAGE_KEY,
	DEFAULT_AGENTIC_SETTINGS,
	mergeAgenticSettings,
	type AgenticSettings,
} from '../../common/agenticSettingsTypes.js';

export const IAgenticSettingsService = createDecorator<IAgenticSettingsService>('agenticSettingsService');

export interface IAgenticSettingsService {
	readonly _serviceBrand: undefined;
	readonly settings: AgenticSettings;
	readonly onDidChange: import('../../../../../base/common/event.js').Event<void>;
	updateSettings(partial: Partial<AgenticSettings>): void;
}

class AgenticSettingsService extends Disposable implements IAgenticSettingsService {
	declare readonly _serviceBrand: undefined;

	private _settings: AgenticSettings = { ...DEFAULT_AGENTIC_SETTINGS };
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(@IStorageService private readonly storageService: IStorageService) {
		super();
		this._load();
	}

	get settings(): AgenticSettings {
		return this._settings;
	}

	updateSettings(partial: Partial<AgenticSettings>): void {
		this._settings = mergeAgenticSettings({ ...this._settings, ...partial });
		this.storageService.store(
			AGENTIC_SETTINGS_STORAGE_KEY,
			JSON.stringify(this._settings),
			StorageScope.APPLICATION,
			StorageTarget.USER,
		);
		this._onDidChange.fire();
	}

	private _load(): void {
		const raw = this.storageService.get(AGENTIC_SETTINGS_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return;
		}
		try {
			this._settings = mergeAgenticSettings(JSON.parse(raw));
		} catch {
			this._settings = { ...DEFAULT_AGENTIC_SETTINGS };
		}
	}
}

registerSingleton(IAgenticSettingsService, AgenticSettingsService, InstantiationType.Eager);
