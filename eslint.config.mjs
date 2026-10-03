import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['build/', 'dist/', 'es/', 'lib/', 'types/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // `cond && fn()` is used intentionally throughout the codebase
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
)
