# Yubifuru - 1v1 Battle Game

A TypeScript monorepo game featuring real-time 1v1 battles with a unique Zone System and random skills.

## Stack

- **Client**: React + Vite + Tailwind CSS
- **Server**: Node.js + Express + Socket.io
- **Shared**: TypeScript types

## Game Features

### Zone System
The game features a unique **Zone System** that dynamically boosts specific skill odds during battle:
- Zone duration is **RANDOM (2-5 turns)** and server-managed
- Each zone boosts specific skill types with multipliers
- Zones change automatically after their random duration expires

### Gameplay
- Real-time 1v1 battles
- Random skill distribution
- HP and MP management
- Turn-based combat with Socket.io

## Project Structure

```
yubifuru/
├── client/          # React + Vite frontend
├── server/          # Node.js + Socket.io backend
├── shared/          # Shared TypeScript types
└── package.json     # Root workspace configuration
```

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation

1. Install dependencies for all workspaces:
```bash
npm install
```

2. Install workspace dependencies:
```bash
npm install --workspaces
```

### Development

Run both client and server concurrently:
```bash
npm run dev
```

Or run them separately:

**Server** (runs on http://localhost:3000):
```bash
npm run dev:server
```

**Client** (runs on http://localhost:5173):
```bash
npm run dev:client
```

### Build

Build all packages:
```bash
npm run build
```

Or build individually:
```bash
npm run build:client
npm run build:server
```

## Key Types

The `shared/types.ts` file contains all shared types:

- **Skill**: Game skills with types (FIRE, WATER, EARTH, WIND, LIGHT, DARK)
- **PlayerState**: Player info including hp, mp, and activeZone
- **Zone**: Zone system with random duration (2-5 turns)
- **GameState**: Overall game state
- **SocketEvent**: Socket.io event types

## Socket.io Events

- `joinGame`: Player joins matchmaking
- `gameStart`: Game begins with initial state
- `useSkill`: Player uses a skill
- `turnUpdate`: Game state updated after turn
- `zoneChange`: Zone changes with new random duration
- `gameOver`: Game ends with winner

## Development Notes

- Server manages zone duration randomly (2-5 turns)
- Client connects to Socket.io server for real-time updates
- Tailwind CSS for styling
- TypeScript for type safety across the monorepo
