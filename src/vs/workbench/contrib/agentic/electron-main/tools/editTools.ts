/*--------------------------------------------------------------------------------------
 *  Agentic AI — edit tools (electron-main) — previews only; apply after approval
 *--------------------------------------------------------------------------------------*/

export interface EditPreview {
	path: string;
	searchReplaceBlocks: string;
	previewSummary: string;
}

export function buildEditPreview(path: string, searchReplaceBlocks: string): EditPreview {
	const blockCount = (searchReplaceBlocks.match(/<<<<<<< ORIGINAL/g) ?? []).length;
	return {
		path,
		searchReplaceBlocks,
		previewSummary: `${blockCount} search/replace block(s) for ${path}`,
	};
}
