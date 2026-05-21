/*--------------------------------------------------------------------------------------
 *  Agentic AI — code intelligence abstraction (AST / KG extensible)
 *--------------------------------------------------------------------------------------*/

export interface SymbolInfo {
	name: string;
	kind: 'function' | 'class' | 'interface' | 'variable' | 'type' | 'unknown';
	line: number;
}

export interface ReferenceMatch {
	path: string;
	line: number;
	snippet: string;
}

export interface RelevantContextChunk {
	path: string;
	snippet: string;
	score: number;
}

export interface ICodeIntelligence {
	indexWorkspace(): Promise<void>;
	parseFile(filePath: string): Promise<SymbolInfo[]>;
	getSymbols(filePath: string): Promise<SymbolInfo[]>;
	findReferences(symbol: string, filePath?: string): Promise<ReferenceMatch[]>;
	getRelevantContext(query: string, maxChunks?: number): Promise<RelevantContextChunk[]>;
}

/** Lexical symbol extraction for common languages (fallback until full AST) */
export function extractSymbolsLexical(content: string, languageId: string): SymbolInfo[] {
	const symbols: SymbolInfo[] = [];
	const patterns: { re: RegExp; kind: SymbolInfo['kind'] }[] = [];

	if (languageId === 'typescript' || languageId === 'javascript' || languageId === 'typescriptreact' || languageId === 'javascriptreact') {
		patterns.push(
			{ re: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
			{ re: /^\s*(?:export\s+)?class\s+(\w+)/gm, kind: 'class' },
			{ re: /^\s*(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
			{ re: /^\s*(?:export\s+)?type\s+(\w+)/gm, kind: 'type' },
			{ re: /^\s*(?:export\s+)?const\s+(\w+)\s*=/gm, kind: 'variable' },
		);
	} else if (languageId === 'python') {
		patterns.push(
			{ re: /^def\s+(\w+)/gm, kind: 'function' },
			{ re: /^class\s+(\w+)/gm, kind: 'class' },
		);
	} else {
		patterns.push({ re: /^\s*(?:function|fn)\s+(\w+)/gm, kind: 'function' });
	}

	for (const { re, kind } of patterns) {
		re.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			const line = content.slice(0, m.index).split('\n').length;
			symbols.push({ name: m[1], kind, line });
			if (symbols.length >= 200) {
				return symbols;
			}
		}
	}
	// dedupe by name+line
	const seen = new Set<string>();
	return symbols.filter(s => {
		const k = `${s.name}:${s.line}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}
