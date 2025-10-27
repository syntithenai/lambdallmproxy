import js from '@eslint/js';
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'docs/**',
      'coverage/**',
      '**/backups/**',
      '**/*.min.js',
      'PROVIDER_CATALOG.json',
      'EMBEDDING_MODELS_CATALOG.json',
      '.aws-sam/**',
      'lambda-layer/**',
      'puppeteer-layer/**'
    ]
  },

  // JavaScript backend files (src/)
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        awslambda: 'readonly'  // AWS Lambda runtime global
      }
    },
    plugins: {
      security,
      'no-secrets': noSecrets
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // Security rules
      'no-secrets/no-secrets': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-require': 'warn',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      
      // Code quality
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off' // Allow console in Lambda functions
    }
  },

  // TypeScript/React frontend files (ui-new/src/)
  {
    files: ['ui-new/src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'no-secrets': noSecrets
    },
    rules: {
      ...js.configs.recommended.rules,
      
      // Security rules
      'no-secrets/no-secrets': 'error',
      
      // TypeScript rules - relaxed for gradual migration
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for now
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'warn',
      'no-useless-escape': 'warn' // Warn instead of error
    }
  },

  // Test files
  {
    files: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: {
        ...globals.jest
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
];
