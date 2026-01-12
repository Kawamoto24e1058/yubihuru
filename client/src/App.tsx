import { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [username, setUsername] = useState('')
  const [hasJoined, setHasJoined] = useState(false)

  useEffect(() => {
    // Connect to Socket.io server
    const newSocket = io('http://localhost:3000')
    
    newSocket.on('connect', () => {
      console.log('Connected to server')
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setIsConnected(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  const handleJoinGame = () => {
    if (socket && username.trim()) {
      socket.emit('joinGame', { username })
      setHasJoined(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="max-w-2xl w-full p-8">
        <h1 className="text-4xl font-bold text-center mb-8 text-blue-400">
          Yubifuru - 1v1 Battle Game
        </h1>
        
        <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Server Status:</span>
              <span className={`px-3 py-1 rounded-full text-sm ${
                isConnected ? 'bg-green-600' : 'bg-red-600'
              }`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          {!hasJoined ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Enter Your Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your username..."
                  onKeyPress={(e) => e.key === 'Enter' && handleJoinGame()}
                />
              </div>
              <button
                onClick={handleJoinGame}
                disabled={!isConnected || !username.trim()}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition"
              >
                Join Game
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-green-400 mb-2">✓ Joined as {username}</p>
              <p className="text-gray-400 text-sm">Waiting for opponent...</p>
              <div className="mt-4 animate-pulse">
                <div className="h-2 bg-blue-600 rounded"></div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Zone System: Random skill boosts (2-5 turns)</p>
          <p className="mt-1">Server-managed random skills</p>
        </div>
      </div>
    </div>
  )
}

export default App
