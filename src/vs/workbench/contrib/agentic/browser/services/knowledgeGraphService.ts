/*--------------------------------------------------------------------------------------
 *  Agentic AI — temporal knowledge graph builder + workspace cache
 *--------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ICodeIntelligenceService } from './codeIntelligenceService.js';
import {
	buildWorkspaceKey,
	DEFAULT_KG_TTL_MS,
	extractImportTargets,
	inferFileRole,
	isKnowledgeGraphFresh,
	type KnowledgeGraphEdge,
	type KnowledgeGraphNode,
	type TemporalKnowledgeGraph,
} from '../../common/codebaseKnowledgeGraph.js';

const KG_CACHE_KEY = 'agentic.knowledgeGraph.v1';

const SKIP_DIRS = new Set([
	'node_modules', '.git', 'out', 'dist', 'build', '.tmp', 'coverage', '.next', '__pycache__',
]);

export const IKnowledgeGraphService = createDecorator<IKnowledgeGraphService>('agenticKnowledgeGraphService');

export interface IKnowledgeGraphService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getCached(): TemporalKnowledgeGraph | null;
	ensureLoaded(): Promise<TemporalKnowledgeGraph | null>;
	getOrBuild(userMessage: string, opts?: { forceRefresh?: boolean }): Promise<TemporalKnowledgeGraph | null>;
	invalidate(): void;
}

class KnowledgeGraphService extends Disposable implements IKnowledgeGraphService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _memoryCache: TemporalKnowledgeGraph | null = null;

	constructor(
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ICodeIntelligenceService private readonly codeIntelligence: ICodeIntelligenceService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._register(this.workspaceContext.onDidChangeWorkspaceFolders(() => this.invalidate()));
	}

	invalidate(): void {
		this._memoryCache = null;
		this.storageService.remove(KG_CACHE_KEY, StorageScope.WORKSPACE);
		this._onDidChange.fire();
	}

	getCached(): TemporalKnowledgeGraph | null {
		const key = this._currentWorkspaceKey();
		if (!key) {
			return null;
		}
		if (this._memoryCache && this._memoryCache.workspaceKey === key) {
			return this._memoryCache;
		}
		const cached = this._loadCached(key);
		if (cached) {
			this._memoryCache = cached;
		}
		return cached;
	}

	async ensureLoaded(): Promise<TemporalKnowledgeGraph | null> {
		const cached = this.getCached();
		if (cached && isKnowledgeGraphFresh(cached)) {
			return cached;
		}
		return this.getOrBuild('');
	}

	async getOrBuild(userMessage: string, opts?: { forceRefresh?: boolean }): Promise<TemporalKnowledgeGraph | null> {
		const folders = this.workspaceContext.getWorkspace().folders.map(f => f.uri.fsPath);
		if (!folders.length) {
			return null;
		}
		const workspaceKey = buildWorkspaceKey(folders);

		if (!opts?.forceRefresh) {
			if (this._memoryCache && this._memoryCache.workspaceKey === workspaceKey && isKnowledgeGraphFresh(this._memoryCache)) {
				return this._enrichForQuery(this._memoryCache, userMessage);
			}
			const cached = this._loadCached(workspaceKey);
			if (cached && isKnowledgeGraphFresh(cached)) {
				this._memoryCache = cached;
				return this._enrichForQuery(cached, userMessage);
			}
		}

		const kg = await this._buildGraph(workspaceKey, folders, userMessage);
		this._memoryCache = kg;
		this._persist(kg);
		this._onDidChange.fire();
		return kg;
	}

	private _currentWorkspaceKey(): string | null {
		const folders = this.workspaceContext.getWorkspace().folders.map(f => f.uri.fsPath);
		if (!folders.length) {
			return null;
		}
		return buildWorkspaceKey(folders);
	}

	private async _buildGraph(
		workspaceKey: string,
		folders: string[],
		userMessage: string,
	): Promise<TemporalKnowledgeGraph> {
		const nodes: KnowledgeGraphNode[] = [{
			id: 'ws',
			kind: 'workspace',
			label: folders.length === 1 ? folders[0].split(/[/\\]/).pop() ?? 'workspace' : 'multi-root workspace',
		}];
		const edges: KnowledgeGraphEdge[] = [];
		const areas: string[] = [];

		for (const root of folders.slice(0, 2)) {
			await this._scanRoot(root, nodes, edges, areas, 0, 2);
		}

		const relevant = await this.codeIntelligence.getRelevantContext(userMessage, 16);
		const queryRelevantPaths = relevant.map(r => ({
			path: r.path,
			score: r.score,
			hint: inferFileRole(r.path),
		}));

		for (const r of relevant.slice(0, 12)) {
			const id = `file:${r.path}`;
			if (!nodes.some(n => n.id === id)) {
				nodes.push({
					id,
					kind: 'file',
					label: r.path.split(/[/\\]/).pop() ?? r.path,
					path: r.path,
					role: inferFileRole(r.path),
				});
			}
			try {
				const uri = URI.file(r.path);
				const content = (await this.fileService.readFile(uri)).value.toString().slice(0, 4096);
				for (const imp of extractImportTargets(content, 6)) {
					edges.push({ from: r.path, to: imp, kind: 'imports' });
				}
			} catch {
				// skip unreadable
			}
		}

		return {
			workspaceKey,
			generatedAt: Date.now(),
			ttlMs: DEFAULT_KG_TTL_MS,
			nodes,
			edges,
			areas: areas.slice(0, 20),
			queryRelevantPaths,
		};
	}

	private async _enrichForQuery(kg: TemporalKnowledgeGraph, userMessage: string): Promise<TemporalKnowledgeGraph> {
		const relevant = await this.codeIntelligence.getRelevantContext(userMessage, 12);
		return {
			...kg,
			queryRelevantPaths: relevant.map(r => ({
				path: r.path,
				score: r.score,
				hint: inferFileRole(r.path),
			})),
		};
	}

	private async _scanRoot(
		rootPath: string,
		nodes: KnowledgeGraphNode[],
		edges: KnowledgeGraphEdge[],
		areas: string[],
		depth: number,
		maxDepth: number,
	): Promise<void> {
		if (depth > maxDepth) {
			return;
		}
		const uri = URI.file(rootPath);
		let children;
		try {
			children = await this.fileService.resolve(uri);
		} catch {
			return;
		}
		if (!children.children) {
			return;
		}
		for (const child of children.children) {
			if (child.isDirectory) {
				const name = child.name;
				if (SKIP_DIRS.has(name) || name.startsWith('.')) {
					continue;
				}
				const rel = child.resource.fsPath.replace(rootPath, '').replace(/^[/\\]/, '') || name;
				if (depth === 0) {
					areas.push(`${rel}/ — top-level area`);
					const dirId = `dir:${rel}`;
					nodes.push({ id: dirId, kind: 'directory', label: rel, path: child.resource.fsPath, role: 'area' });
					edges.push({ from: 'ws', to: dirId, kind: 'contains' });
				}
				if (depth < maxDepth) {
					await this._scanRoot(child.resource.fsPath, nodes, edges, areas, depth + 1, maxDepth);
				}
			} else if (child.name === 'package.json' || child.name === 'README.md') {
				const pkgId = `pkg:${child.resource.fsPath}`;
				nodes.push({ id: pkgId, kind: 'package', label: child.resource.fsPath.split(/[/\\]/).slice(-2).join('/'), path: child.resource.fsPath });
				edges.push({ from: 'ws', to: pkgId, kind: 'contains' });
			}
		}
	}

	private _loadCached(workspaceKey: string): TemporalKnowledgeGraph | null {
		const raw = this.storageService.get(KG_CACHE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return null;
		}
		try {
			const kg = JSON.parse(raw) as TemporalKnowledgeGraph;
			return kg.workspaceKey === workspaceKey ? kg : null;
		} catch {
			return null;
		}
	}

	private _persist(kg: TemporalKnowledgeGraph): void {
		this.storageService.store(KG_CACHE_KEY, JSON.stringify(kg), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

registerSingleton(IKnowledgeGraphService, KnowledgeGraphService, InstantiationType.Delayed);
