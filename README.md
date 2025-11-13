# ambo-backend

Role-based operations backend (Super Admin / Worker / Client Viewer) with task assignment, client portal, audit logs.

## Stack
- Node.js + Express + TypeScript
- Prisma ORM
- PostgreSQL
- JWT auth
- Bcrypt password hashing

## Quickstart

1. Copy env:
```bash
cp .env.example .env
```
Edit `.env` values.

2. Start Postgres (Docker):
```bash
docker-compose up -d
```

3. Install deps:
```bash
npm install
```

4. Generate Prisma client & run migrations:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

5. Seed first SUPER_ADMIN:
```bash
npm run seed:admin
```
You'll see an email + password in the console. Use that to log in.

6. Run API:
```bash
npm run dev
```

Server runs on `PORT` from `.env` (default 4000).

## Key Endpoints (base: /api)

### Auth
- POST `/auth/login`
- POST `/auth/register-worker` (SUPER_ADMIN only)
- POST `/auth/register-client` (SUPER_ADMIN only)

### Users (SUPER_ADMIN only)
- GET `/users`
- PATCH `/users/:id`

### Clients
- GET `/clients`  
  - SUPER_ADMIN: all clients  
  - WORKER: only clients tied to their tasks  
  - CLIENT_VIEWER: only their own company profile  
- POST `/clients` (SUPER_ADMIN only)

### Tasks
- GET `/tasks`
- GET `/tasks/:id`
- POST `/tasks` (SUPER_ADMIN only)
- PATCH `/tasks/:id/status` (assigned worker or SUPER_ADMIN)

### Task Comments
- GET `/tasks/:taskId/comments`
- POST `/tasks/:taskId/comments`
  - SUPER_ADMIN
  - assigned WORKER
  - linked CLIENT_VIEWER

### Activity Log
- GET `/activity`
  - SUPER_ADMIN: global
  - WORKER: own actions
  - CLIENT_VIEWER: only activity tied to their tasks

## Notes
- Role-based access is enforced in middleware.
- All sensitive actions generate AuditLog records.
- Client Viewer role is already supported, so you can expose a `/portal` frontend later without changing backend permissions.

You're set.
