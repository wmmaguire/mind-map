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
│   └── README.md
├── server/
│   ├── server.js
│   ├── package.json
│   └── README.md
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
cd talk-graph
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
- The backend will automatically restart when changes are made to the backend code.
- The frontend will automatically restart when changes are made to the frontend code.

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