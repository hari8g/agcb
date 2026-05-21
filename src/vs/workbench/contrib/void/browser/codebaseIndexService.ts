/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodebaseIndexStats, CodebaseSearchResult } from '../common/codebaseIndexServiceTypes.js';
import { Emitter } from '../../../../base/common/event.js';
import { EndOfLinePreference } from '../../../../editor/common/model.js';
import { IVoidModelService } from '../common/voidModelService.js';

export const ICodebaseIndexService = createDecorator<ICodebaseIndexService>('codebaseIndexService');

type IndexedFile = {
	uri: URI;
	relPath: string;
	lowerContent: string;
	lines: string[];
};

const SKIP_DIRS = new Set([
	'node_modules', '.git', 'out', 'dist', 'build', '.tmp',
	'coverage', '.next', '__pycache__', '.void',
]);

const MAX_FILES = 8000;
const MAX_FILE_BYTES = 512_000;

export interface ICodebaseIndexService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeIndex: import('../../../../base/common/event.js').Event<void>;
	rebuildIndex(): Promise<void>;
	search(query: string, maxResults?: number): Promise<CodebaseSearchResult[]>;
	getStats(): CodebaseIndexStats;
}

class CodebaseIndexService extends Disposable implements ICodebaseIndexService {
	_serviceBrand: undefined;

	private _files: IndexedFile[] = [];
	private _lastIndexed: number | null = null;
	private _isIndexing = false;

	private readonly _onDidChangeIndex = this._register(new Emitter<void>());
	readonly onDidChangeIndex = this._onDidChangeIndex.event;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IVoidModelService private readonly _voidModelService: IVoidModelService,
	) {
		super();
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this.rebuildIndex();
		}));
		void this.rebuildIndex();
	}

	getStats(): CodebaseIndexStats {
		return { fileCount: this._files.length, lastIndexed: this._lastIndexed, isIndexing: this._isIndexing };
	}

	async rebuildIndex(): Promise<void> {
		if (this._isIndexing) return;
		this._isIndexing = true;
		const files: IndexedFile[] = [];

		try {
			const folders = this._workspaceContextService.getWorkspace().folders;
			for (const folder of folders) {
				await this._walkFolder(folder.uri, folder.uri.fsPath, files);
				if (files.length >= MAX_FILES) break;
			}
			this._files = files.slice(0, MAX_FILES);
			this._lastIndexed = Date.now();
			this._onDidChangeIndex.fire();
		} finally {
			this._isIndexing = false;
		}
	}

	private async _walkFolder(uri: URI, rootFsPath: string, files: IndexedFile[]): Promise<void> {
		if (files.length >= MAX_FILES) return;
		let stat;
		try {
			stat = await this._fileService.resolve(uri);
		} catch {
			return;
		}
		if (!stat.children) return;

		for (const child of stat.children) {
			if (files.length >= MAX_FILES) return;
			if (!child.isDirectory && !child.isFile) continue;
			const name = child.name;
			if (child.isDirectory) {
				if (SKIP_DIRS.has(name)) continue;
				await this._walkFolder(child.resource, rootFsPath, files);
			} else if (child.isFile) {
				await this._indexFile(child.resource, rootFsPath, files);
			}
		}
	}

	private async _indexFile(uri: URI, rootFsPath: string, files: IndexedFile[]): Promise<void> {
		const path = uri.fsPath;
		if (path.includes('node_modules') || path.endsWith('.min.js') || path.endsWith('.map')) return;

		try {
			await this._voidModelService.initializeModel(uri);
			const { model } = this._voidModelService.getModel(uri);
			if (!model) return;
			const content = model.getValue(EndOfLinePreference.LF);
			if (content.length > MAX_FILE_BYTES) return;

			const relPath = path.startsWith(rootFsPath)
				? path.slice(rootFsPath.length).replace(/^[/\\]/, '')
				: path;

			files.push({
				uri,
				relPath,
				lowerContent: content.toLowerCase(),
				lines: content.split('\n'),
			});
		} catch {
			// skip unreadable files
		}
	}

	async search(query: string, maxResults = 25): Promise<CodebaseSearchResult[]> {
		if (!query.trim()) return [];
		if (this._files.length === 0) await this.rebuildIndex();

		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		const results: CodebaseSearchResult[] = [];

		for (const file of this._files) {
			let score = 0;
			for (const term of terms) {
				if (file.relPath.toLowerCase().includes(term)) score += 8;
				const idx = file.lowerContent.indexOf(term);
				if (idx !== -1) score += 4 + Math.min(3, (file.lowerContent.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length);
			}
			if (score === 0) continue;

			const lineIdx = this._bestMatchingLine(file, terms);
			const snippet = this._snippetAtLine(file.lines, lineIdx);
			results.push({ uri: file.uri, score, line: lineIdx + 1, snippet });
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, maxResults);
	}

	private _bestMatchingLine(file: IndexedFile, terms: string[]): number {
		let bestLine = 0;
		let bestScore = -1;
		for (let i = 0; i < file.lines.length; i++) {
			const lower = file.lines[i].toLowerCase();
			let s = 0;
			for (const t of terms) {
				if (lower.includes(t)) s += 1;
			}
			if (s > bestScore) {
				bestScore = s;
				bestLine = i;
			}
		}
		return bestLine;
	}

	private _snippetAtLine(lines: string[], lineIdx: number): string {
		const start = Math.max(0, lineIdx - 1);
		const end = Math.min(lines.length, lineIdx + 3);
		return lines.slice(start, end).join('\n').slice(0, 500);
	}
}

registerSingleton(ICodebaseIndexService, CodebaseIndexService, InstantiationType.Delayed);
