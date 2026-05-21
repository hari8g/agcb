/*--------------------------------------------------------------------------------------
 *  Agentic AI — code intelligence (lexical + codebase index)
 *--------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import {
	extractSymbolsLexical,
	type ICodeIntelligence,
	type ReferenceMatch,
	type RelevantContextChunk,
	type SymbolInfo,
} from '../../common/codeIntelligenceTypes.js';
import { ICodebaseIndexService } from '../../../void/browser/codebaseIndexService.js';

export const ICodeIntelligenceService = createDecorator<ICodeIntelligenceService>('agenticCodeIntelligenceService');

export interface ICodeIntelligenceService extends ICodeIntelligence {
	readonly _serviceBrand: undefined;
}

class CodeIntelligenceService extends Disposable implements ICodeIntelligenceService {
	declare readonly _serviceBrand: undefined;

	private readonly _symbolCache = new Map<string, SymbolInfo[]>();

	constructor(
		@ICodebaseIndexService private readonly codebaseIndex: ICodebaseIndexService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
	}

	async indexWorkspace(): Promise<void> {
		await this.codebaseIndex.rebuildIndex();
		this._symbolCache.clear();
	}

	async parseFile(filePath: string): Promise<SymbolInfo[]> {
		const symbols = await this.getSymbols(filePath);
		this._symbolCache.set(filePath, symbols);
		return symbols;
	}

	async getSymbols(filePath: string): Promise<SymbolInfo[]> {
		const cached = this._symbolCache.get(filePath);
		if (cached) {
			return cached;
		}
		try {
			const uri = URI.file(filePath);
			const content = await this.fileService.readFile(uri);
			const text = content.value.toString().slice(0, 512_000);
			const ext = filePath.split('.').pop() ?? '';
			const languageId = ext === 'ts' || ext === 'tsx' ? 'typescript'
				: ext === 'js' || ext === 'jsx' ? 'javascript'
					: ext === 'py' ? 'python' : 'plaintext';
			const symbols = extractSymbolsLexical(text, languageId);
			this._symbolCache.set(filePath, symbols);
			return symbols;
		} catch {
			return [];
		}
	}

	async findReferences(symbol: string, filePath?: string): Promise<ReferenceMatch[]> {
		const query = filePath ? `${symbol} ${filePath}` : symbol;
		const results = await this.codebaseIndex.search(query, 15);
		return results.map(r => ({
			path: r.uri.fsPath,
			line: r.line,
			snippet: r.snippet,
		}));
	}

	async getRelevantContext(query: string, maxChunks = 10): Promise<RelevantContextChunk[]> {
		const results = await this.codebaseIndex.search(query, maxChunks);
		return results.map(r => ({
			path: r.uri.fsPath,
			snippet: r.snippet,
			score: r.score,
		}));
	}
}

registerSingleton(ICodeIntelligenceService, CodeIntelligenceService, InstantiationType.Delayed);
