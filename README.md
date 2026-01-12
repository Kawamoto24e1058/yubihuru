# Yubifuru - 1v1 バトルゲーム

独自のゾーンシステムとランダムスキルを特徴とした、リアルタイム1v1バトルを楽しめるTypeScriptモノレポゲームです。

## 技術スタック

- **クライアント**: React + Vite + Tailwind CSS
- **サーバー**: Node.js + Express + Socket.io
- **共通**: TypeScript型定義

## ゲームの特徴

### ゾーンシステム
このゲームは、バトル中に特定のスキル発動率を動的に上昇させる独自の**ゾーンシステム**を備えています：
- ゾーンの持続時間は**ランダム（2〜5ターン）**で、サーバー側で管理されます
- 各ゾーンは特定のスキルタイプを倍率で強化します
- ゾーンはランダムな持続時間が経過すると自動的に変化します

### ゲームプレイ
- リアルタイム1v1バトル
- ランダムなスキル配分
- HPとMPの管理
- Socket.ioを使用したターン制バトル

## プロジェクト構成

```
yubifuru/
├── client/          # React + Vite フロントエンド
├── server/          # Node.js + Socket.io バックエンド
├── shared/          # 共通TypeScript型定義
└── package.json     # ルートワークスペース設定
```

## セットアップ手順

### 前提条件
- Node.js 18以上がインストールされていること
- npmまたはyarn

### インストール

1. すべてのワークスペースの依存関係をインストール：
```bash
npm install
```

2. ワークスペースの依存関係をインストール：
```bash
npm install --workspaces
```

### 開発

クライアントとサーバーを同時に実行：
```bash
npm run dev
```

または個別に実行：

**サーバー** (http://localhost:3000 で実行):
```bash
npm run dev:server
```

**クライアント** (http://localhost:5173 で実行):
```bash
npm run dev:client
```

### ビルド

すべてのパッケージをビルド：
```bash
npm run build
```

または個別にビルド：
```bash
npm run build:client
npm run build:server
```

## 主要な型定義

`shared/types.ts` ファイルには、すべての共通型定義が含まれています：

- **Skill**: ゲームのスキル（FIRE、WATER、EARTH、WIND、LIGHT、DARK）
- **PlayerState**: hp、mp、activeZoneなどのプレイヤー情報
- **Zone**: ランダムな持続時間（2〜5ターン）を持つゾーンシステム
- **GameState**: ゲーム全体の状態
- **SocketEvent**: Socket.ioイベントの型定義

## Socket.ioイベント

- `joinGame`: プレイヤーがマッチメイキングに参加
- `gameStart`: ゲームが初期状態で開始
- `useSkill`: プレイヤーがスキルを使用
- `turnUpdate`: ターン後にゲーム状態が更新

## 🚀 デプロイ

本番環境へのデプロイ方法については、[DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。

### クイックデプロイ

**バックエンド (Render)**:
- Root Directory: `server`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

**フロントエンド (Vercel)**:
- Root Directory: `client`
- Framework: Vite
- Environment Variable: `VITE_API_URL` = バックエンドのURL

詳細な手順は [DEPLOYMENT.md](DEPLOYMENT.md) を参照してください。
- `zoneChange`: Zone changes with new random duration
- `gameOver`: Game ends with winner

## Development Notes

- Server manages zone duration randomly (2-5 turns)
- Client connects to Socket.io server for real-time updates
- Tailwind CSS for styling
- TypeScript for type safety across the monorepo
