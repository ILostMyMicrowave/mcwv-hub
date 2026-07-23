# MCWV Hub

Private clan dashboard for Pet Simulator 99 clan **MCWV**.

## Features

- Live leaderboard tracking
- War tracking and analytics
- Contribution statistics
- Hall of fame / achievements
- Player profiles (Roblox integration)
- Theme settings (default/ice/inferno)
- Clan settings and role management (member/officer/owner)

## Tech Stack

- **Framework**: Next.js 16.2.4
- **Runtime**: React 19.2.4, TypeScript 5
- **Database**: PostgreSQL via `pg`
- **Styling**: Tailwind CSS v4
- **Charts**: ECharts 5.5.0
- **Authentication**: iron-session with encrypted cookies
- **Password Hashing**: bcryptjs
- **Input Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Environment variables (see `.env.example`)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Configure your .env.local with actual values
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Build

```bash
npm run build
npm start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SESSION_SECRET` | Secret key for session encryption (min 32 chars) | Yes |
| `PS99_API` | Pet Simulator 99 API endpoint | Yes |
| `CLAN_API` | Clan API endpoint | Yes |
| `BOT_ADMIN_API_URL` | Protected local/admin API exposed by MCWV-BOT | For admin bot controls |
| `BOT_ADMIN_API_KEY` | Shared secret sent to MCWV-BOT as `X-Admin-API-Key` | For admin bot controls |
| `NODE_ENV` | Node environment (development/production) | Yes |

## Project Structure

```
app/
├── api/              # API routes
│   ├── auth/         # Authentication (login, logout, signup, etc.)
│   ├── achievements/ # Achievement management
│   ├── hall-of-fame/ # Hall of fame management
│   ├── leaderboard/  # Live leaderboard
│   ├── war-analyst/  # War analytics
│   ├── war-collector/# War data collection
│   └── ...
├── achievements/     # Achievement pages
├── hall-of-fame/     # Hall of fame pages
├── leaderboard/      # Leaderboard pages
├── login/            # Login page
├── profile/          # User profiles
├── settings/         # User and global settings
├── signup/           # Signup page
├── war-analyst/      # War analyst page
├── war-info/         # War information page
├── layout.tsx        # Root layout
└── page.tsx          # Homepage

lib/
├── db.ts            # Database connection pool
├── session.ts       # Session configuration
└── rateLimit.ts     # Rate limiting utility

components/           # Reusable React components
hooks/               # Custom React hooks
docs/                # Documentation
types/               # TypeScript type definitions
```

## Security

- All authentication uses iron-session with encrypted cookies
- Role checks query the database (not trusted from session)
- Input validation with Zod on all mutation routes
- Rate limiting on auth endpoints
- Generic error responses (no internal details leaked)

## Deployment

Deploy on [Vercel](https://vercel.com/new?filter=next.js) or any platform that supports Next.js.

## License

Private repository - all rights reserved.
