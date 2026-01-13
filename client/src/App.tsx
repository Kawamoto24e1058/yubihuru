import { useState } from 'react'
import './App.css'

function App() {
  const [username, setUsername] = useState('')

  const handleBattleStart = () => {
    if (username.trim()) {
      console.log("参加: " + username)
    } else {
      console.log("名前を入力してください")
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* タイトルロゴ */}
        <div className="text-center">
          <h1 className="text-6xl font-black mb-2 transform -rotate-2 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent animate-pulse">
            YUBIFURU
          </h1>
          <h2 className="text-5xl font-black transform rotate-1 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 bg-clip-text text-transparent">
            BATTLE
          </h2>
          <p className="mt-4 text-gray-400 text-sm">指を振って戦う1v1バトルゲーム</p>
        </div>

        {/* 名前入力フォーム */}
        <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border-2 border-slate-700 space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-bold text-gray-300 mb-3 uppercase tracking-wider">
              プレイヤー名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleBattleStart()}
              placeholder="あなたの名前を入力..."
              className="w-full px-6 py-4 bg-slate-700 border-2 border-slate-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500 transition-all duration-200 text-lg font-semibold"
              maxLength={20}
            />
          </div>

          {/* 参加ボタン */}
          <button
            onClick={handleBattleStart}
            className="w-full py-4 px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl font-black text-xl uppercase tracking-wider shadow-lg hover:shadow-2xl transform hover:scale-105 active:scale-95 transition-all duration-200"
          >
            ⚔️ Battle Start
          </button>
        </div>

        {/* フッター */}
        <div className="text-center text-gray-600 text-xs space-y-1">
          <p>マッチングシステム準備中...</p>
          <p className="text-gray-700">v0.1.0 Alpha</p>
        </div>
      </div>
    </div>
  )
}

export default App
