# Yubifuru デプロイガイド

このドキュメントでは、Yubifuru ゲームをVercel（フロントエンド）とRender（バックエンド）にデプロイする手順を説明します。

## 📋 前提条件

- GitHubアカウント
- Vercelアカウント（https://vercel.com/）
- Renderアカウント（https://render.com/）
- このリポジトリがGitHubにプッシュされていること

## 🚀 バックエンドのデプロイ (Render)

### 1. Renderでプロジェクトを作成

1. [Render Dashboard](https://dashboard.render.com/) にログイン
2. 「New +」→「Web Service」を選択
3. GitHubリポジトリを接続
4. このリポジトリを選択

### 2. ビルド設定

以下の設定を入力：

- **Name**: `yubifuru-backend` (任意の名前)
- **Region**: `Oregon (US West)` または最寄りのリージョン
- **Branch**: `main` (またはデプロイしたいブランチ)
- **Root Directory**: `server`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### 3. 環境変数（オプション）

現時点では特別な環境変数は不要ですが、将来的に必要な場合は「Environment」タブで設定できます。

### 4. デプロイ

「Create Web Service」をクリックしてデプロイを開始します。

デプロイが完了すると、以下のようなURLが発行されます：
```
https://yubifuru-backend.onrender.com
```

このURLを**メモしておいてください**（フロントエンドの設定で使用します）。

## 🎨 フロントエンドのデプロイ (Vercel)

### 1. Vercelでプロジェクトをインポート

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. 「Add New...」→「Project」を選択
3. GitHubリポジトリをインポート
4. このリポジトリを選択

### 2. ビルド設定

以下の設定を入力：

- **Project Name**: `yubifuru` (任意の名前)
- **Framework Preset**: `Vite`
- **Root Directory**: `client`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 3. 環境変数の設定

「Environment Variables」セクションで以下を追加：

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://yubifuru-backend.onrender.com` |

⚠️ **重要**: `VITE_API_URL` の値は、手順1でメモしたRenderのバックエンドURLに置き換えてください。

### 4. デプロイ

「Deploy」をクリックしてデプロイを開始します。

デプロイが完了すると、以下のようなURLが発行されます：
```
https://yubifuru.vercel.app
```

## 🎮 動作確認

1. VercelのURLにアクセス
2. 2つのブラウザタブで開く
3. 両方でユーザー名を入力してマッチング
4. ゲームが正常に動作することを確認

## 🔧 トラブルシューティング

### バックエンドに接続できない

1. Renderのログを確認：
   - Render Dashboard → あなたのサービス → 「Logs」タブ
   
2. バックエンドURLが正しいか確認：
   - Vercelの環境変数 `VITE_API_URL` を確認

3. CORSエラーの場合：
   - サーバー側で `origin: '*'` が設定されているか確認
   - ブラウザのコンソールでエラーメッセージを確認

### ビルドエラー

**Render側**:
```bash
# ローカルでビルドをテスト
cd server
npm install
npm run build
npm start
```

**Vercel側**:
```bash
# ローカルでビルドをテスト
cd client
npm install
npm run build
npm run preview
```

### 再デプロイが必要な場合

**Render**:
- Dashboard → あなたのサービス → 「Manual Deploy」→「Deploy latest commit」

**Vercel**:
- Dashboard → あなたのプロジェクト → 「Deployments」→「Redeploy」

## 📝 環境変数の更新

### フロントエンド (Vercel)

1. Vercel Dashboard → プロジェクト → 「Settings」→「Environment Variables」
2. 変数を編集または追加
3. 「Save」→「Redeploy」

### バックエンド (Render)

1. Render Dashboard → サービス → 「Environment」
2. 変数を編集または追加
3. 「Save Changes」（自動的に再デプロイされます）

## 🔒 セキュリティに関する注意

本番環境では、CORS設定を以下のように制限することを推奨します：

```typescript
// server/src/index.ts
const io = new Server(httpServer, {
  cors: {
    origin: 'https://yubifuru.vercel.app', // あなたのVercel URLに置き換え
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: 'https://yubifuru.vercel.app', // あなたのVercel URLに置き換え
}));
```

## 📊 モニタリング

### Render
- ログ: Dashboard → サービス → 「Logs」
- メトリクス: Dashboard → サービス → 「Metrics」

### Vercel
- ログ: Dashboard → プロジェクト → 「Deployments」→ 各デプロイメント
- アナリティクス: Dashboard → プロジェクト → 「Analytics」

## 🆘 サポート

問題が発生した場合：
1. Renderのログを確認
2. Vercelのデプロイメントログを確認
3. ブラウザのコンソールでエラーを確認
4. GitHubのIssuesで報告

---

デプロイが完了したら、世界中のプレイヤーとYubifuruをお楽しみください！🎮✨
