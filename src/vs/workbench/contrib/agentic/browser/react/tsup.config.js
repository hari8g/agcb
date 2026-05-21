/*--------------------------------------------------------------------------------------
 *  Agentic AI — React bundle config
 *--------------------------------------------------------------------------------------*/

import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['./src/agentic-tsx/index.tsx'],
	outDir: './out',
	format: ['esm'],
	splitting: false,
	clean: false,
	platform: 'browser',
	target: 'esnext',
	injectStyle: true,
	outExtension: () => ({ js: '.js' }),
	noExternal: [/^(?!\.).*$/],
	external: [
		new RegExp('../../../*.js'.replaceAll('.', '\\.').replaceAll('*', '.*')),
	],
	treeshake: true,
	esbuildOptions(options) {
		options.outbase = 'src';
		options.jsx = 'automatic';
		options.jsxImportSource = 'react';
	},
});
