import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'

export default defineConfigWithVueTs(
  {
    ignores: ['node_modules', 'coverage', 'dist', 'ios', 'android', 'public', 'vendor']
  },
  pluginVue.configs['flat/essential'],
  js.configs.recommended,
  vueTsConfigs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node
    },
    rules: {
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'vue/no-deprecated-slot-attribute': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    }
  }
)
