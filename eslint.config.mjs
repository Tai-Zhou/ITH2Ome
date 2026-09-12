import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';

export default [
	{
		ignores: ['out/**', 'node_modules/**'],
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
		},
		plugins: {
			'@typescript-eslint': tseslint,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			// API JSON 回调大量使用 any，属无类型接口的有意用法，暂不强约束
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
];
