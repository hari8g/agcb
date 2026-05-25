/*--------------------------------------------------------------------------------------
 *  Agentic AI — LSP symbol references + parallel target file reads for refactor impact
 *--------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { DocumentSymbol, SymbolKind } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import type {
	PreflightFileSnippet,
	SymbolImpactAnalysis,
	SymbolImpactReference,
} from '../../common/symbolImpactAnalysis.js';
import { ICodeIntelligenceService } from './codeIntelligenceService.js';

export const ISymbolImpactService = createDecorator<ISymbolImpactService>('agenticSymbolImpactService');

export interface ISymbolImpactService {
	readonly _serviceBrand: undefined;
	analyzeTargets(targetPaths: string[], opts?: { maxFiles?: number; maxSymbolsPerFile?: number }): Promise<SymbolImpactAnalysis | null>;
	readTargetFilesParallel(paths: string[], opts?: { maxFiles?: number; maxCharsPerFile?: number }): Promise<PreflightFileSnippet[]>;
}

const DEFAULT_MAX_FILES = 6;
const DEFAULT_MAX_SYMBOLS = 4;
const DEFAULT_MAX_CHARS = 4500;

class SymbolImpactService extends Disposable implements ISymbolImpactService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IModelService private readonly modelService: IModelService,
		@ILanguageFeaturesService private readonly languageFeatures: ILanguageFeaturesService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContext: IWorkspaceContextService,
		@ICodeIntelligenceService private readonly codeIntelligence: ICodeIntelligenceService,
	) {
		super();
	}

	async analyzeTargets(
		targetPaths: string[],
		opts?: { maxFiles?: number; maxSymbolsPerFile?: number },
	): Promise<SymbolImpactAnalysis | null> {
		const maxFiles = opts?.maxFiles ?? DEFAULT_MAX_FILES;
		const maxSymbols = opts?.maxSymbolsPerFile ?? DEFAULT_MAX_SYMBOLS;
		const paths = [...new Set(targetPaths.filter(Boolean))].slice(0, maxFiles);
		if (!paths.length) {
			return null;
		}

		const references: SymbolImpactReference[] = [];
		const anchorsByFile: SymbolImpactAnalysis['anchorsByFile'] = [];
		const seenRef = new Set<string>();

		for (const relPath of paths) {
			const fullPath = await this._resolvePath(relPath);
			if (!fullPath) {
				continue;
			}
			const uri = URI.file(fullPath);
			const model = this.modelService.getModel(uri)
				?? (await this._ensureModel(uri));
			if (!model) {
				const symbols = await this.codeIntelligence.getSymbols(fullPath);
				const anchorNames = symbols.slice(0, maxSymbols).map(s => s.name);
				if (anchorNames.length) {
					anchorsByFile.push({ path: relPath, symbols: anchorNames });
				}
				for (const sym of symbols.slice(0, maxSymbols)) {
					const indexRefs = await this.codeIntelligence.findReferences(sym.name, fullPath);
					for (const r of indexRefs.slice(0, 8)) {
						this._addReference(references, seenRef, {
							symbol: sym.name,
							path: this._relativize(r.path),
							line: r.line,
							source: 'index',
						});
					}
				}
				continue;
			}

			const docSymbols = await this._documentSymbols(model);
			const anchors = this._pickAnchorSymbols(docSymbols).slice(0, maxSymbols);
			anchorsByFile.push({
				path: relPath,
				symbols: anchors.map(s => s.name),
			});

			const refProviders = this.languageFeatures.referenceProvider.ordered(model);
			for (const sym of anchors) {
				const pos = new Position(sym.range.startLineNumber, sym.range.startColumn);
				let gotLsp = false;
				for (const provider of refProviders) {
					try {
						const refs = await provider.provideReferences(
							model,
							pos,
							{ includeDeclaration: true },
							CancellationToken.None,
						);
						if (!refs?.length) {
							continue;
						}
						gotLsp = true;
						for (const ref of refs.slice(0, 12)) {
							this._addReference(references, seenRef, {
								symbol: sym.name,
								path: this._relativize(ref.uri.fsPath),
								line: ref.range.startLineNumber,
								source: 'lsp',
							});
						}
						break;
					} catch {
						// try next provider
					}
				}
				if (!gotLsp) {
					const indexRefs = await this.codeIntelligence.findReferences(sym.name, fullPath);
					for (const r of indexRefs.slice(0, 8)) {
						this._addReference(references, seenRef, {
							symbol: sym.name,
							path: this._relativize(r.path),
							line: r.line,
							source: 'index',
						});
					}
				}
			}
		}

		if (!references.length && !anchorsByFile.length) {
			return null;
		}
		return { references, anchorsByFile };
	}

	async readTargetFilesParallel(
		paths: string[],
		opts?: { maxFiles?: number; maxCharsPerFile?: number },
	): Promise<PreflightFileSnippet[]> {
		const maxFiles = opts?.maxFiles ?? DEFAULT_MAX_FILES;
		const maxChars = opts?.maxCharsPerFile ?? DEFAULT_MAX_CHARS;
		const unique = [...new Set(paths.filter(Boolean))].slice(0, maxFiles);
		return Promise.all(unique.map(async (relPath) => {
			try {
				const full = await this._resolvePath(relPath);
				if (!full) {
					return { path: relPath, content: '', truncated: false, error: 'File not found in workspace' };
				}
				const raw = (await this.fileService.readFile(URI.file(full))).value.toString();
				const truncated = raw.length > maxChars;
				return {
					path: relPath,
					content: truncated ? raw.slice(0, maxChars) : raw,
					truncated,
				};
			} catch (e) {
				return {
					path: relPath,
					content: '',
					truncated: false,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}));
	}

	private _addReference(
		out: SymbolImpactReference[],
		seen: Set<string>,
		ref: SymbolImpactReference,
	): void {
		const key = `${ref.path}:${ref.line}:${ref.symbol}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		out.push(ref);
	}

	private async _documentSymbols(model: import('../../../../../editor/common/model.js').ITextModel): Promise<DocumentSymbol[]> {
		const providers = this.languageFeatures.documentSymbolProvider.ordered(model);
		for (const provider of providers) {
			try {
				const result = await provider.provideDocumentSymbols(model, CancellationToken.None);
				if (result?.length) {
					return this._flattenSymbols(result);
				}
			} catch {
				// next provider
			}
		}
		return [];
	}

	private _pickAnchorSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
		const priority = (k: SymbolKind) => {
			switch (k) {
				case SymbolKind.Class:
				case SymbolKind.Interface:
				case SymbolKind.Enum:
					return 0;
				case SymbolKind.Function:
				case SymbolKind.Method:
					return 1;
				case SymbolKind.Variable:
				case SymbolKind.Constant:
					return 2;
				default:
					return 3;
			}
		};
		return [...symbols]
			.filter(s => s.name && !s.name.startsWith('_'))
			.sort((a, b) => priority(a.kind) - priority(b.kind));
	}

	private _flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
		const flat: DocumentSymbol[] = [];
		for (const sym of symbols) {
			flat.push(sym);
			if (sym.children?.length) {
				flat.push(...this._flattenSymbols(sym.children));
			}
		}
		return flat;
	}

	private async _ensureModel(uri: URI): Promise<import('../../../../../editor/common/model.js').ITextModel | null> {
		try {
			const content = (await this.fileService.readFile(uri)).value.toString();
			return this.modelService.createModel(content, null, uri);
		} catch {
			return null;
		}
	}

	private async _resolvePath(relPath: string): Promise<string | undefined> {
		const trimmed = relPath.trim();
		if (!trimmed) {
			return undefined;
		}
		if (trimmed.startsWith('/') || /^[a-zA-Z]:\\/.test(trimmed)) {
			try {
				const stat = await this.fileService.stat(URI.file(trimmed));
				if (stat) {
					return trimmed;
				}
			} catch { /* fall through */ }
		}
		for (const folder of this.workspaceContext.getWorkspace().folders) {
			const full = `${folder.uri.fsPath}/${trimmed.replace(/^[/\\]/, '')}`;
			try {
				await this.fileService.stat(URI.file(full));
				return full;
			} catch { /* next */ }
		}
		return undefined;
	}

	private _relativize(absPath: string): string {
		for (const folder of this.workspaceContext.getWorkspace().folders) {
			const root = folder.uri.fsPath;
			if (absPath.startsWith(root)) {
				return absPath.slice(root.length + 1);
			}
		}
		return absPath;
	}
}

registerSingleton(ISymbolImpactService, SymbolImpactService, InstantiationType.Delayed);
