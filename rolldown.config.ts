import { defineConfig } from 'rolldown';

export default defineConfig({
	input: 'src/extension.ts',
	platform: 'node',
	external: ['vscode'],
	output: {
		file: 'out/main.js',
		format: 'cjs',
		sourcemap: true,
	},
});
