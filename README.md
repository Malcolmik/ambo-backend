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



# AMBO V2 Patch - Admin Permissions & New Features

This patch includes fixes for ADMIN role permissions and two new SUPER_ADMIN features.

## Summary of Changes

### 1. ADMIN Role Permission Fixes
**Problem:** ADMIN role couldn't access Clients, Contracts, Tasks, Reviews pages.
**Solution:** Updated route files to include ADMIN role.

### 2. New Feature: Super Admin Financial Export
**Endpoint:** `GET /api/worker/admin/export-all-payments`
**Access:** SUPER_ADMIN only

### 3. New Feature: Job Broadcast History
**Endpoint:** `GET /api/jobs/broadcast-history`
**Access:** SUPER_ADMIN only

### 4. Schema Change: Track Who Broadcasted Jobs
**Field:** `postedById` added to Task model

---

## Files Changed

### Prisma Schema
- `prisma/schema.prisma` - Added `postedById` field and `tasksPosted` relation

### Migration
- `prisma/migrations/20251229_add_posted_by/migration.sql` - Database migration

### Route Files (ADMIN Permission Fix)
- `src/modules/clients/clients.routes.ts` - Added ADMIN to PATCH /:id
- `src/modules/contracts/contracts.routes.ts` - Added ADMIN to POST /, GET /, PATCH /:id/status
- `src/modules/tasks/tasks.routes.ts` - Added ADMIN to POST /
- `src/modules/reviews/reviews.routes.ts` - Added ADMIN to GET /stats

### Jobs Module (Broadcast History + postedById)
- `src/modules/jobs/jobs.controller.ts` - Updated pushToBroadcast, added getBroadcastHistory
- `src/modules/jobs/jobs.routes.ts` - Added /broadcast-history route

### Worker Module (Financial Export)
- `src/modules/worker/worker.controller.ts` - Added exportAllWorkerPayments
- `src/modules/worker/worker.routes.ts` - Added /admin/export-all-payments route

---

## Deployment Steps

### Step 1: Run the Migration
```bash
# Option A: Using Prisma migrate
npx prisma migrate deploy

# Option B: Run SQL directly on Railway
# Copy contents of prisma/migrations/20251229_add_posted_by/migration.sql
# and run in Railway's database console
```

### Step 2: Replace Files
Replace the following files in your backend:

```
prisma/
  schema.prisma

src/modules/
  clients/clients.routes.ts
  contracts/contracts.routes.ts
  tasks/tasks.routes.ts
  reviews/reviews.routes.ts
  jobs/jobs.controller.ts
  jobs/jobs.routes.ts
  worker/worker.controller.ts
  worker/worker.routes.ts
```

### Step 3: Regenerate Prisma Client
```bash
npx prisma generate
```

### Step 4: Deploy
Push changes to Railway and the build should automatically run.

---

## New API Endpoints

### 1. Export All Worker Payments (SUPER_ADMIN)
```
GET /api/worker/admin/export-all-payments
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| workerId | string | Filter by specific worker |
| year | number | Filter by year (e.g., 2025) |
| month | number | Filter by month (1-12) |
| status | string | PAID, PENDING, or ALL |

**Response:**
```json
{
  "success": true,
  "data": {
    "exportedAt": "2025-12-29T10:00:00Z",
    "exportedBy": { "id": "...", "name": "Super Admin" },
    "filters": { "workerId": "all", "year": "2025", "month": "all", "status": "all" },
    "summary": {
      "totalRecords": 50,
      "totalPaid": 500000,
      "totalPending": 150000,
      "grandTotal": 650000,
      "currency": "NGN"
    },
    "workerSummary": [
      { "workerId": "...", "name": "John Doe", "email": "john@email.com", "paid": 100000, "pending": 50000, "total": 150000, "tasks": 5 }
    ],
    "payments": [
      {
        "workerName": "John Doe",
        "workerEmail": "john@email.com",
        "workerId": "...",
        "taskId": "...",
        "taskTitle": "Logo Design",
        "clientName": "ABC Corp",
        "amount": 50000,
        "currency": "NGN",
        "paymentStatus": "PAID",
        "completedDate": "2025-12-15",
        "paidDate": "2025-12-20"
      }
    ],
    "workers": [
      { "id": "...", "name": "John Doe", "email": "john@email.com" }
    ]
  }
}
```

---

### 2. Broadcast History (SUPER_ADMIN)
```
GET /api/jobs/broadcast-history
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by job status (OPEN, REVIEWING, ASSIGNED, etc.) |
| postedById | string | Filter by admin who posted |
| startDate | ISO date | Jobs posted after this date |
| endDate | ISO date | Jobs posted before this date |

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "...",
        "title": "Logo Design",
        "description": "...",
        "priority": "HIGH",
        "jobStatus": "ASSIGNED",
        "taskStatus": "IN_PROGRESS",
        "paymentAmount": 50000,
        "workerPaymentStatus": "PENDING",
        "deadline": "2025-12-30T00:00:00Z",
        "postedAt": "2025-12-20T10:00:00Z",
        "createdAt": "2025-12-19T08:00:00Z",
        "client": { "id": "...", "companyName": "ABC Corp" },
        "postedBy": { "id": "...", "name": "Admin Adam", "email": "adam@ambo.com", "role": "ADMIN" },
        "assignedTo": { "id": "...", "name": "John Doe", "email": "john@email.com" },
        "totalApplications": 3
      }
    ],
    "stats": {
      "totalBroadcasted": 25,
      "open": 5,
      "reviewing": 3,
      "assigned": 10,
      "inProgress": 5,
      "completed": 2,
      "cancelled": 0,
      "totalPaymentValue": 1250000
    },
    "posters": [
      { "id": "...", "name": "Admin Adam", "role": "ADMIN" },
      { "id": "...", "name": "Super Admin", "role": "SUPER_ADMIN" }
    ],
    "count": 25
  }
}
```

---

## Frontend Prompts for Lovable

### Prompt: Super Admin Financial Export Page

```
Create a new page at src/pages/admin/FinancialExport.tsx for SUPER_ADMIN only:

1. Add to sidebar in AppSidebar.tsx (SUPER_ADMIN only):
   - Icon: Download
   - Label: "Export Payments"
   - Path: /admin/export-payments

2. Add route in App.tsx:
   <Route path="/admin/export-payments" element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]}><FinancialExport /></ProtectedRoute>} />

3. Page features:
   - Title: "Export Worker Payments"
   - Filter section with:
     - Worker dropdown (from API response workers array)
     - Year dropdown (last 5 years)
     - Month dropdown (optional, only if year selected)
     - Status dropdown (All, Paid, Pending)
   - Summary cards showing: Total Records, Total Paid, Total Pending, Grand Total
   - Worker summary table showing breakdown by worker
   - Full payments table with all columns
   - "Export to CSV" button that downloads the data

4. API: GET /api/worker/admin/export-all-payments with query params

5. CSV export should include columns:
   Worker Name, Worker Email, Task ID, Task Title, Client, Amount (NGN), Status, Completed Date, Paid Date

6. Include summary row at bottom of CSV:
   "TOTAL", "", "", "", "", [grandTotal], "", "", ""
   "PAID", "", "", "", "", [totalPaid], "", "", ""
   "PENDING", "", "", "", "", [totalPending], "", "", ""
```

---

### Prompt: Broadcast History Page

```
Create a new page at src/pages/admin/BroadcastHistory.tsx for SUPER_ADMIN only:

1. Add to sidebar in AppSidebar.tsx (SUPER_ADMIN only):
   - Icon: History
   - Label: "Broadcast History"
   - Path: /admin/broadcast-history

2. Add route in App.tsx:
   <Route path="/admin/broadcast-history" element={<ProtectedRoute allowedRoles={["SUPER_ADMIN"]}><BroadcastHistory /></ProtectedRoute>} />

3. Page features:
   - Title: "Job Broadcast History"
   - Stats cards row showing: Total Broadcasted, Open, Reviewing, Assigned, In Progress, Completed, Total Value
   - Filter section:
     - Posted By dropdown (from API posters array)
     - Status dropdown (all statuses)
     - Date range picker
   - Table with columns:
     - Job Title
     - Client
     - Payment Amount
     - Posted By (admin name)
     - Posted Date
     - Status (badge)
     - Assigned To
     - Applications
   - Click row to view job details

4. API: GET /api/jobs/broadcast-history with query params

5. Use shadcn Badge for status with colors:
   - OPEN: blue
   - REVIEWING: yellow
   - ASSIGNED: purple
   - IN_PROGRESS: orange
   - COMPLETED: green
   - CANCELLED: red
```

---

## Testing Checklist

### ADMIN Permission Fix
- [ ] ADMIN can view /admin/clients
- [ ] ADMIN can create new client
- [ ] ADMIN can edit client
- [ ] ADMIN can view /admin/contracts
- [ ] ADMIN can create new contract
- [ ] ADMIN can update contract status
- [ ] ADMIN can view /admin/tasks
- [ ] ADMIN can create new task
- [ ] ADMIN can view /admin/client-responses
- [ ] ADMIN can view review stats

### Super Admin Financial Export
- [ ] Only SUPER_ADMIN can access /api/worker/admin/export-all-payments
- [ ] Filter by worker works
- [ ] Filter by year works
- [ ] Filter by month works
- [ ] Filter by status works
- [ ] Summary totals are correct
- [ ] Worker summary is accurate
- [ ] All payments are included

### Broadcast History
- [ ] Only SUPER_ADMIN can access /api/jobs/broadcast-history
- [ ] postedBy shows correct admin name
- [ ] Filter by postedById works
- [ ] Filter by status works
- [ ] Filter by date range works
- [ ] Stats are accurate
- [ ] All broadcasted jobs appear (not DRAFT)

### postedById Field
- [ ] When admin broadcasts job, postedById is set
- [ ] Existing broadcasted jobs have postedById backfilled to createdById
- [ ] postedBy relation works in queries


# AMBO V2 Controller Patch - ADMIN Role Permissions Fix

## Problem
The ADMIN role was getting "Access denied. You don't have permission for this action." errors on:
- Clients page (`/admin/clients`)
- Contracts page (`/admin/contracts`)
- Tasks page (`/admin/tasks`)

## Root Cause
The **controller functions** had internal role checks that only allowed `SUPER_ADMIN`, but did not include the new `ADMIN` role added in V2.

**Note:** The route files had been updated with `requireRole("SUPER_ADMIN", "ADMIN")` but the controller functions inside were doing additional role checks that still only allowed `SUPER_ADMIN`.

## Files Changed

### 1. `src/modules/clients/clients.controller.ts`

| Function | Change |
|----------|--------|
| `listClients()` | Added `ADMIN` to role check (line 11) |
| `getClients()` | Changed from `!== "SUPER_ADMIN"` to `!== "SUPER_ADMIN" && !== "ADMIN"` |

### 2. `src/modules/contracts/contracts.controller.ts`

| Function | Change |
|----------|--------|
| `getAllContracts()` | Changed from `!== "SUPER_ADMIN"` to `!== "SUPER_ADMIN" && !== "ADMIN"` |
| `myContracts()` | Added `ADMIN` to role check alongside `SUPER_ADMIN` |
| `getContract()` | Added `ADMIN` to authorization check |
| `getContractTasks()` | Added `ADMIN` to authorization check |
| `updateContractStatus()` | Changed from `!== "SUPER_ADMIN"` to `!== "SUPER_ADMIN" && !== "ADMIN"` |

### 3. `src/modules/tasks/tasks.controller.ts`

| Function | Change |
|----------|--------|
| `listTasks()` | Added `ADMIN` to role check alongside `SUPER_ADMIN` |
| `getTask()` | Added `ADMIN` to role check alongside `SUPER_ADMIN` |
| `updateTask()` | Changed `isAdmin` check to include `ADMIN` role |
| `updateTaskStatus()` | Added `ADMIN` to role check |
| `acceptTask()` | Added `ADMIN` to notification recipients |
| `declineTask()` | Added `ADMIN` to notification recipients |
| `completeTask()` | Added `ADMIN` to notification recipients |

## Deployment Steps

### Step 1: Replace Controller Files
Copy these files to your backend project, replacing the existing files:

```
src/modules/clients/clients.controller.ts
src/modules/contracts/contracts.controller.ts
src/modules/tasks/tasks.controller.ts
```

### Step 2: Deploy to Railway
```bash
git add .
git commit -m "Fix ADMIN role permissions in controllers"
git push
```

Railway will automatically redeploy.

### Step 3: Verify
1. Log in as an ADMIN user
2. Navigate to:
   - `/admin/clients` - Should load client list
   - `/admin/contracts` - Should load contracts list
   - `/admin/tasks` - Should load tasks list
3. Verify no more "Access denied" errors

## Testing Checklist

- [ ] ADMIN can view Clients page
- [ ] ADMIN can view Contracts page
- [ ] ADMIN can view Tasks page
- [ ] ADMIN can edit client details
- [ ] ADMIN can update contract status
- [ ] ADMIN can create new tasks
- [ ] ADMIN can update task status
- [ ] SUPER_ADMIN still has full access (no regression)
- [ ] WORKER permissions unchanged
- [ ] CLIENT_VIEWER permissions unchanged

## Summary of Role Matrix After Fix

| Resource | SUPER_ADMIN | ADMIN | WORKER | CLIENT_VIEWER |
|----------|-------------|-------|--------|---------------|
| View All Clients | ✅ | ✅ | Own only | Own only |
| Edit Client | ✅ | ✅ | ❌ | ❌ |
| Delete Client | ✅ | ❌ | ❌ | ❌ |
| View All Contracts | ✅ | ✅ | Assigned only | Own only |
| Update Contract Status | ✅ | ✅ | ❌ | ❌ |
| View All Tasks | ✅ | ✅ | Assigned only | Own only |
| Create Task | ✅ | ✅ | ❌ | ❌ |
| Update Task | ✅ | ✅ | Assigned only | ❌ |
| Admin Users | ✅ | ❌ | ❌ | ❌ |
| Platform Settings | ✅ | ❌ | ❌ | ❌ |
