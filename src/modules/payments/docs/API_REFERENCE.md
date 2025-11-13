# AMBO Backend - API Reference

## Base URL
```
http://localhost:4000/api
```

## Authentication
All protected endpoints require a Bearer token:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 Authentication Endpoints

### Login
```http
POST /auth/login
```
**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "id": "user_123",
      "role": "CLIENT_VIEWER",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

### Register Worker (SUPER_ADMIN only)
```http
POST /auth/register-worker
Authorization: Bearer <admin_token>
```
**Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "+2348012345678",
  "password": "securepass123"
}
```

### Register Client User (SUPER_ADMIN only)
```http
POST /auth/register-client
Authorization: Bearer <admin_token>
```
**Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+2348012345678",
  "password": "securepass123",
  "clientId": "client_123"
}
```

---

## 💰 Payment Endpoints

### Initiate Payment
```http
POST /payments/initiate
Authorization: Bearer <token>
```
**Body:**
```json
{
  "clientId": "client_123",
  "packageType": "DELUXE",
  "totalPrice": 250000,
  "currency": "NGN",
  "services": ["Social Media", "Content Creation"]
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "ref_abc123",
    "contractId": "contract_xyz789"
  }
}
```

### Verify Payment
```http
POST /payments/verify
Authorization: Bearer <token>
```
**Body:**
```json
{
  "reference": "ref_abc123"
}
```

### Paystack Webhook (Automated)
```http
POST /payments/webhook
x-paystack-signature: <signature>
```
**Body:** (Sent by Paystack)
```json
{
  "event": "charge.success",
  "data": {
    "reference": "ref_abc123",
    "amount": 25000000,
    "currency": "NGN",
    "channel": "card",
    "paid_at": "2025-01-28T10:00:00.000Z",
    "status": "success"
  }
}
```

---

## 📝 Questionnaire Endpoints

### Submit Questionnaire
```http
POST /questionnaire
Authorization: Bearer <token>
```
**Body:**
```json
{
  "contractId": "contract_123",
  "responses": {
    "businessGoals": "Increase brand awareness",
    "targetAudience": "Young professionals",
    "competitors": ["Competitor A"],
    "brandColors": "#FF5733",
    "preferredStyle": "Modern",
    "additionalNotes": "Weekly updates preferred"
  }
}
```

### Get Questionnaire
```http
GET /questionnaire/:contractId
Authorization: Bearer <token>
```

---

## 📋 Contract Endpoints

### Get My Contracts
```http
GET /contracts/my
Authorization: Bearer <token>
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "contract_123",
      "packageType": "DELUXE",
      "totalPrice": 250000,
      "currency": "NGN",
      "status": "IN_PROGRESS",
      "paymentStatus": "PAID",
      "createdAt": "2025-01-28T10:00:00.000Z",
      "client": {
        "id": "client_456",
        "companyName": "Test Company"
      },
      "payments": [...],
      "questionnaire": {...}
    }
  ]
}
```

### Get Contract Details
```http
GET /contracts/:id
Authorization: Bearer <token>
```

### Get Contract Tasks
```http
GET /contracts/:id/tasks
Authorization: Bearer <token>
```

### Update Contract Status (SUPER_ADMIN only)
```http
PATCH /contracts/:id/status
Authorization: Bearer <admin_token>
```
**Body:**
```json
{
  "status": "IN_PROGRESS"
}
```

**Contract Status Options:**
- `AWAITING_PAYMENT`
- `AWAITING_QUESTIONNAIRE`
- `READY_FOR_ASSIGNMENT`
- `IN_PROGRESS`
- `ON_HOLD`
- `COMPLETE`
- `CANCELLED`

---

## 🔔 Notification Endpoints

### Get Notifications
```http
GET /notifications
Authorization: Bearer <token>
```
**Query Params:**
- `unreadOnly=true` - Only show unread notifications

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notif_123",
      "type": "PAYMENT_CONFIRMED",
      "title": "Payment Successful",
      "body": "Your payment of 250,000 NGN has been confirmed.",
      "readAt": null,
      "createdAt": "2025-01-28T10:00:00.000Z"
    }
  ]
}
```

### Get Unread Count
```http
GET /notifications/unread-count
Authorization: Bearer <token>
```

### Mark Notification as Read
```http
PATCH /notifications/:id/read
Authorization: Bearer <token>
```

### Mark All as Read
```http
PATCH /notifications/read-all
Authorization: Bearer <token>
```

---

## 👥 Client Endpoints

### List Clients
```http
GET /clients
Authorization: Bearer <token>
```
**Role Behavior:**
- `SUPER_ADMIN`: All clients
- `WORKER`: Clients with tasks assigned to them
- `CLIENT_VIEWER`: Only their own company

### Create Client (SUPER_ADMIN only)
```http
POST /clients
Authorization: Bearer <admin_token>
```
**Body:**
```json
{
  "companyName": "New Company Ltd",
  "contactPerson": "John Doe",
  "email": "contact@newcompany.com",
  "phone": "+2348012345678",
  "whatsapp": "+2348012345678",
  "status": "ACTIVE"
}
```

---

## ✅ Task Endpoints

### List Tasks
```http
GET /tasks
Authorization: Bearer <token>
```
**Role Behavior:**
- `SUPER_ADMIN`: All tasks
- `WORKER`: Tasks assigned to them
- `CLIENT_VIEWER`: Tasks for their company

### Get Task Details
```http
GET /tasks/:id
Authorization: Bearer <token>
```

### Create Task (SUPER_ADMIN only)
```http
POST /tasks
Authorization: Bearer <admin_token>
```
**Body:**
```json
{
  "title": "Create social media calendar",
  "description": "Monthly content calendar for all platforms",
  "priority": "HIGH",
  "dueDate": "2025-02-15T10:00:00.000Z",
  "clientId": "client_123",
  "assignedToId": "worker_456",
  "requiresApproval": true
}
```

### Update Task
```http
PATCH /tasks/:id
Authorization: Bearer <token>
```
**Body:** (All fields optional)
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "priority": "CRITICAL",
  "status": "IN_PROGRESS",
  "dueDate": "2025-02-20T10:00:00.000Z",
  "assignedToId": "worker_789"
}
```

**Priority Options:** `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
**Status Options:** `NOT_STARTED`, `IN_PROGRESS`, `WAITING`, `DONE`, `REJECTED`

### Update Task Status (Quick Update)
```http
PATCH /tasks/:id/status
Authorization: Bearer <token>
```
**Body:**
```json
{
  "newStatus": "IN_PROGRESS",
  "message": "Started working on this task",
  "attachmentUrl": "https://example.com/proof.jpg"
}
```

---

## 💬 Task Comment Endpoints

### Get Task Comments
```http
GET /tasks/:taskId/comments
Authorization: Bearer <token>
```

### Add Comment
```http
POST /tasks/:taskId/comments
Authorization: Bearer <token>
```
**Body:**
```json
{
  "content": "This looks great! Please proceed."
}
```

---

## 👤 User Endpoints

### List Users (SUPER_ADMIN only)
```http
GET /users
Authorization: Bearer <admin_token>
```

### Update User (SUPER_ADMIN only)
```http
PATCH /users/:id
Authorization: Bearer <admin_token>
```
**Body:**
```json
{
  "active": true,
  "name": "Updated Name",
  "phone": "+2348012345678"
}
```

---

## 📊 Activity/Audit Endpoints

### Get Activity Log
```http
GET /activity
Authorization: Bearer <token>
```
**Role Behavior:**
- `SUPER_ADMIN`: Global activity log
- `WORKER`: Own actions
- `CLIENT_VIEWER`: Activity for their tasks

---

## 📌 Notification Types

| Type | Description |
|------|-------------|
| `PAYMENT_CONFIRMED` | Payment successfully processed |
| `QUESTIONNAIRE_SUBMITTED` | Client submitted questionnaire |
| `TASK_ASSIGNED` | New task assigned |
| `TASK_STATUS_UPDATE` | Task status changed |
| `CONTRACT_STATUS_UPDATE` | Contract status changed |

---

## 🎯 Role-Based Access Summary

| Endpoint | SUPER_ADMIN | WORKER | CLIENT_VIEWER | CLIENT_VIEWER_PENDING |
|----------|-------------|---------|---------------|----------------------|
| POST /payments/initiate | ✅ | ❌ | ✅ | ✅ |
| POST /questionnaire | ✅ | ❌ | ✅ | ❌ |
| GET /contracts/my | ✅ | ❌ | ✅ | ❌ |
| POST /tasks | ✅ | ❌ | ❌ | ❌ |
| PATCH /tasks/:id | ✅ | ✅ (own) | ❌ | ❌ |
| GET /tasks | ✅ (all) | ✅ (assigned) | ✅ (company) | ❌ |
| POST /clients | ✅ | ❌ | ❌ | ❌ |
| GET /notifications | ✅ | ✅ | ✅ | ✅ |

---

## 🔑 Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

### Common HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized (no/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error
- `502` - Bad Gateway (external API error)

---

## 🧪 Testing Tips

### Get Tokens for Different Roles
```bash
# Login as Super Admin
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"adminpassword"}'

# Login as Worker
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"worker@example.com","password":"workerpass"}'

# Login as Client
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@example.com","password":"clientpass"}'
```

### Test Payment Webhook Locally
```bash
# Use ngrok to expose local server
ngrok http 4000

# Set webhook URL in Paystack dashboard
# https://your-ngrok-url.ngrok.io/api/payments/webhook
```

---

## 📚 Additional Resources

- [Paystack API Docs](https://paystack.com/docs/api)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
