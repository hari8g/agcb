/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { join, relative } from 'path';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';

export const ICSSDevelopmentService = createDecorator<ICSSDevelopmentService>('ICSSDevelopmentService');

export interface ICSSDevelopmentService {
	_serviceBrand: undefined;
	isEnabled: boolean;
	getCssModules(): Promise<string[]>;
}

export class CSSDevelopmentService implements ICSSDevelopmentService {

	declare _serviceBrand: undefined;

	private _cssModules?: Promise<string[]>;

	constructor(
		@INativeEnvironmentService private readonly envService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService
	) { }

	get isEnabled(): boolean {
		return !this.envService.isBuilt;
	}

	getCssModules(): Promise<string[]> {
		this._cssModules ??= this.computeCssModules();
		return this._cssModules;
	}

	private async computeCssModules(): Promise<string[]> {
		if (!this.isEnabled) {
			return [];
		}

		const rg = await import('@vscode/ripgrep');
		return await new Promise<string[]>((resolve) => {

			const sw = StopWatch.create();

			const chunks: string[][] = [];
			const decoder = new TextDecoder();
			// Always scan `out/` (paths must be relative to appRoot/out for renderer import maps).
			const basePath = join(this.envService.appRoot, 'out');
			const process = spawn(rg.rgPath, ['-g', '**/*.css', '--files', '--no-ignore', basePath], {});

			process.stdout.on('data', data => {
				const chunk = decoder.decode(data, { stream: true });
				chunks.push(chunk.split('\n').filter(Boolean));
			});
			process.on('error', err => {
				this.logService.error('[CSS_DEV] FAILED to compute CSS data', err);
				resolve([]);
			});
			process.on('close', () => {
				const result = chunks.flat()
					.map(path => relative(basePath, path).replace(/\\/g, '/'))
					.map(path => path.replace(/^out\//, ''))
					.filter(path => path && /\.css$/i.test(path) && !path.endsWith('/'))
					.sort();
				resolve(result);
				this.logService.info(`[CSS_DEV] DONE, ${result.length} css modules (${Math.round(sw.elapsed())}ms)`);
			});
		});
	}
}
