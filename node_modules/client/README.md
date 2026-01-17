# React + TypeScript + Vite

このテンプレートは、ViteでReactをHMRといくつかのESLintルールとともに動作させるための最小限のセットアップを提供します。

現在、2つの公式プラグインが利用可能です：

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) は、Fast Refreshのために [Babel](https://babeljs.io/)（または [rolldown-vite](https://vite.dev/guide/rolldown) で使用する場合は [oxc](https://oxc.rs)）を使用します
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) は、Fast Refreshのために [SWC](https://swc.rs/) を使用します

## React Compiler

React Compilerは、開発とビルドのパフォーマンスへの影響を考慮して、このテンプレートでは有効になっていません。追加するには、[このドキュメント](https://react.dev/learn/react-compiler/installation)を参照してください。

## ESLint設定の拡張

本番アプリケーションを開発する場合は、型を考慮したlintルールを有効にするために設定を更新することをお勧めします：

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // その他の設定...

      // tseslint.configs.recommendedを削除し、これに置き換えます
      tseslint.configs.recommendedTypeChecked,
      // または、より厳格なルールを使用する場合はこちら
      tseslint.configs.strictTypeChecked,
      // オプションで、スタイルに関するルールを追加
      tseslint.configs.stylisticTypeChecked,

      // その他の設定...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // その他のオプション...
    },
  },
])
```

また、React固有のlintルールのために [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) と [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) をインストールすることもできます：

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // その他の設定...
      // React用のlintルールを有効化
      reactX.configs['recommended-typescript'],
      // React DOM用のlintルールを有効化
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // その他のオプション...
    },
  },
])
```
