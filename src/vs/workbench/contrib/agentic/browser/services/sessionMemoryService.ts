/*--------------------------------------------------------------------------------------
 *  Agentic AI — workspace session memory + project model persistence
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import {
	buildSessionMemoryPromptBlock,
	emptyProjectModel,
	emptyUserMemory,
	extractExplicitUserMemory,
	factsFromProjectScan,
	inferMemoryFromRun,
	MAX_PROJECT_FACTS,
	MAX_USER_FACTS,
	mergeFacts,
	partitionIncomingFacts,
	type ProjectScanHints,
} from '../../common/sessionMemory.js';
import type { MemoryFact, RunMemoryInput, SessionMemorySnapshot } from '../../common/sessionMemoryTypes.js';
import { buildWorkspaceKey } from '../../common/codebaseKnowledgeGraph.js';

const PROJECT_MODEL_KEY = 'agentic.projectModel.v1';
const USER_MEMORY_KEY = 'agentic.userMemory.v1';

export const ISessionMemoryService = createDecorator<ISessionMemoryService>('agenticSessionMemoryService');

export interface ISessionMemoryService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	getSnapshot(): SessionMemorySnapshot;
	getPromptBlock(): Promise<string>;
	recordExplicitUserMessage(userMessage: string): Promise<void>;
	recordFromRun(input: RunMemoryInput): Promise<void>;
	addUserFacts(facts: MemoryFact[]): Promise<void>;
	clearUserMemory(): void;
	removeUserFact(factId: string): void;
	refreshProjectScan(): Promise<void>;
}

class SessionMemoryService extends Disposable implements ISessionMemoryService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _project = emptyProjectModel('');
	private _user = emptyUserMemory('');
	private _loaded = false;
	private _scanDone = false;

	constructor(
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();
		this._register(this.workspaceContext.onDidChangeWorkspaceFolders(() => {
			this._loaded = false;
			this._scanDone = false;
			this._ensureLoaded();
		}));
	}

	getSnapshot(): SessionMemorySnapshot {
		this._ensureLoaded();
		return { project: this._project, user: this._user };
	}

	async getPromptBlock(): Promise<string> {
		this._ensureLoaded();
		if (!this._scanDone) {
			await this.refreshProjectScan();
		}
		return buildSessionMemoryPromptBlock(this._project, this._user);
	}

	async recordExplicitUserMessage(userMessage: string): Promise<void> {
		const facts = extractExplicitUserMemory(userMessage);
		if (!facts.length) {
			return;
		}
		await this.addUserFacts(facts);
	}

	async recordFromRun(input: RunMemoryInput): Promise<void> {
		this._ensureLoaded();
		const inferred = inferMemoryFromRun(input);
		if (!inferred.length) {
			return;
		}
		const { project, user } = partitionIncomingFacts(inferred);
		if (project.length) {
			this._project.facts = mergeFacts(this._project.facts, project, MAX_PROJECT_FACTS);
			this._project.updatedAt = Date.now();
			this._persistProject();
		}
		if (user.length) {
			this._user.facts = mergeFacts(this._user.facts, user, MAX_USER_FACTS);
			this._user.updatedAt = Date.now();
			this._persistUser();
		}
		if (project.length || user.length) {
			this._notifyChange();
		}
	}

	async addUserFacts(facts: MemoryFact[]): Promise<void> {
		this._ensureLoaded();
		if (!facts.length) {
			return;
		}
		this._user.facts = mergeFacts(this._user.facts, facts, MAX_USER_FACTS);
		this._user.updatedAt = Date.now();
		this._persistUser();
		this._notifyChange();
	}

	clearUserMemory(): void {
		this._ensureLoaded();
		this._user = emptyUserMemory(this._workspaceKey());
		this._persistUser();
		this._onDidChange.fire();
	}

	removeUserFact(factId: string): void {
		this._ensureLoaded();
		const next = this._user.facts.filter(f => f.id !== factId);
		if (next.length === this._user.facts.length) {
			return;
		}
		this._user.facts = next;
		this._user.updatedAt = Date.now();
		this._persistUser();
		this._notifyChange();
	}

	private _notifyChange(): void {
		this._onDidChange.fire();
	}

	async refreshProjectScan(): Promise<void> {
		this._ensureLoaded();
		const hints = await this._scanWorkspace();
		const scanned = factsFromProjectScan(hints);
		const tags: string[] = [];
		if (hints.packageManager) {
			tags.push(hints.packageManager);
		}
		if (hints.hasTypeScript) {
			tags.push('typescript');
		}
		if (hints.monorepo) {
			tags.push('monorepo');
		}
		if (hints.hasTests) {
			tags.push('tests');
		}
		this._project.tags = [...new Set(tags)];
		if (scanned.length) {
			this._project.facts = mergeFacts(this._project.facts, scanned, MAX_PROJECT_FACTS);
			this._project.updatedAt = Date.now();
			this._persistProject();
		}
		this._scanDone = true;
		this._notifyChange();
	}

	private _ensureLoaded(): void {
		if (this._loaded) {
			return;
		}
		const key = this._workspaceKey();
		this._project = this._loadJson(PROJECT_MODEL_KEY, emptyProjectModel(key));
		this._user = this._loadJson(USER_MEMORY_KEY, emptyUserMemory(key));
		if (this._project.workspaceKey !== key) {
			this._project = emptyProjectModel(key);
		}
		if (this._user.workspaceKey !== key) {
			this._user = emptyUserMemory(key);
		}
		this._loaded = true;
	}

	private _workspaceKey(): string {
		const folders = this.workspaceContext.getWorkspace().folders.map(f => f.uri.fsPath);
		return buildWorkspaceKey(folders);
	}

	private _loadJson<T>(storageKey: string, fallback: T): T {
		const raw = this.storageService.get(storageKey, StorageScope.WORKSPACE);
		if (!raw) {
			return fallback;
		}
		try {
			return JSON.parse(raw) as T;
		} catch {
			return fallback;
		}
	}

	private _persistProject(): void {
		this.storageService.store(
			PROJECT_MODEL_KEY,
			JSON.stringify(this._project),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
	}

	private _persistUser(): void {
		this.storageService.store(
			USER_MEMORY_KEY,
			JSON.stringify(this._user),
			StorageScope.WORKSPACE,
			StorageTarget.MACHINE,
		);
	}

	private async _scanWorkspace(): Promise<ProjectScanHints> {
		const hints: ProjectScanHints = {};
		const root = this.workspaceContext.getWorkspace().folders[0]?.uri;
		if (!root) {
			return hints;
		}
		for (const name of ['pnpm-workspace.yaml', 'lerna.json', 'nx.json']) {
			try {
				await this.fileService.stat(URI.joinPath(root, name));
				hints.monorepo = true;
				break;
			} catch { /* next */ }
		}
		try {
			await this.fileService.stat(URI.joinPath(root, 'tsconfig.json'));
			hints.hasTypeScript = true;
		} catch { /* ok */ }

		try {
			const pkgUri = URI.joinPath(root, 'package.json');
			const pkg = JSON.parse((await this.fileService.readFile(pkgUri)).value.toString());
			if (typeof pkg.name === 'string') {
				hints.packageName = pkg.name;
			}
			if (typeof pkg.packageManager === 'string') {
				hints.packageManager = pkg.packageManager.split('@')[0];
			}
			if (pkg.scripts?.test) {
				hints.hasTests = true;
				hints.testScript = String(pkg.scripts.test).slice(0, 80);
			}
		} catch { /* no package.json */ }

		if (!hints.packageManager) {
			for (const lock of ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json']) {
				try {
					await this.fileService.stat(URI.joinPath(root, lock));
					hints.packageManager = lock.startsWith('pnpm') ? 'pnpm' : lock.startsWith('yarn') ? 'yarn' : 'npm';
					break;
				} catch { /* next */ }
			}
		}

		return hints;
	}
}

registerSingleton(ISessionMemoryService, SessionMemoryService, InstantiationType.Delayed);
