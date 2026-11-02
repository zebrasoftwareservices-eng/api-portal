// SPDX-License-Identifier: Apache-2.0
import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'packages/sdk/src/schema.d.ts'] }, js.configs.recommended, ...ts.configs.recommended, { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } });
