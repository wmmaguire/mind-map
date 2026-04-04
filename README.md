# MindMap 

A full-stack web application that transcribes or audio and text files into mindmaps for introspective and exploratory purposes.

## Tech Stack

- **Frontend**: React
- **Backend**: Node.js/Express
- **Other Tools**: Concurrently for development

## Project Structure
```
mind-map/
├── client/
│   ├── public/
│   ├── src/
│   ├── .env
│   ├── package.json
│   ├── package-lock.json
│   └── README.md
├── server/
│   ├── server.js
│   ├── routes/
│   │   ├── files.js      # /api/files, /api/upload, file content
│   │   └── graphs.js     # /api/graphs/* (save, list, load, views)
│   ├── models/           # Mongoose schemas (Session, File, Graph, UserActivity, …)
│   ├── lib/              # shared helpers (e.g. recordUserActivity)
│   ├── package.json
│   └── READEME.md        # server architecture (not README.md)
├── .env
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/wmmaguire/mind-map.git
cd mind-map
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run start
```

4. Open your browser and navigate to `http://localhost:3000` to see the app in action.

### Development

- Frontend code can be modified in the `client/src` directory.
- Backend code can be modified in the `server` directory.
- Frontend unit tests (Jest / Testing Library): from `client/`, run `npm test` (watch mode) or `npm test -- --watchAll=false` once. See **`client/README.md`** → *Testing (Jest)* for router/d3 setup details.
- The backend will automatically restart when changes are made to the backend code.
- The frontend will automatically restart when changes are made to the frontend code.

#### Backend API layout

- Full detail: **`server/READEME.md`** (env vars, flows, OpenAI, persistence).
- **Hybrid persistence / source of truth:** **`server/READEME.md`** → **Data consistency (hybrid persistence)** — what lives on disk vs Mongo, and known divergence cases (GitHub **#20**, **#44**).
- **Library uploads** (`GET/POST /api/files`, `POST /api/upload`) and **persisted graphs** (`/api/graphs/*`) are implemented in **`server/routes/files.js`** and **`server/routes/graphs.js`** (mounted from `server.js`).
- **User activity audit:** the server writes **`UserActivity`** documents for high-level outcomes (session lifecycle, uploads, analyze completion, graph save/view, feedback) alongside domain collections (`File`, `GraphTransform`, `GraphOperation`, etc.). See **`server/READEME.md`** → “User activity audit” and the persistence matrix (GitHub **#16**).
- **Multiple files per session** are allowed; older MongoDB databases may still have a legacy **unique index on `sessionId`** in the `files` collection—drop it if second uploads fail (see **server/READEME.md** upload section, and GitHub **#42**).

#### Database Migrations

- To save a backup of your current database, run `mongodump --db <database-name> --collection <collection-name> --out <backup-directory>`.
- To run the migrations, run `node server/scripts/migrate.js`.
- To test the migrations, open a `mongosh` shell and inspect the database:
```bash
show dbs
use <database-name> //mind-map
show collections
db.getCollection('<collection-name>').find().pretty()
```
- To restore the database from a backup, run `mongorestore --db <database-name> <backup-directory>`.
- To delete the database, open a `mongosh` shell and then 
```bash
use <database-name> // mind-map
db.sessions.drop() // drop the sessions collection
db.dropDatabase() // drop the database
```

### Additional Notes

- Ensure that the backend server is running before starting the frontend.
- The backend server is configured to run on port 5001, and the frontend is configured to run on port 3000.
- The `.env` file contains the necessary environment variables for the backend server.