# AMBO Backend - Payment System Implementation Guide

## 📋 Overview
This guide walks you through implementing the complete payment and contract workflow for AMBO backend.

## 🚀 Step-by-Step Implementation

### 1. Update Prisma Schema
```bash
# Replace your current prisma/schema.prisma with the new schema.prisma file
cp schema.prisma prisma/schema.prisma

# Generate Prisma client
npx prisma generate

# Create and run migration
npx prisma migrate dev --name add_payment_system
```

**Alternative if migration fails:**
```bash
# Apply the SQL migration manually
psql -U postgres -d ambo_db -f add_payment_system.sql

# Then generate client
npx prisma generate
```

### 2. Add Environment Variables
Add to your `.env` file:
```env
PAYSTACK_SECRET_KEY=sk_test_your_secret_key_here
```

Get your Paystack keys from: https://dashboard.paystack.com/#/settings/developer

### 3. Update Module Structure
Create new module folders and copy files:

```bash
# Create module directories
mkdir -p src/modules/questionnaire
mkdir -p src/modules/notifications
mkdir -p src/modules/contracts

# Copy controller files
cp payments.controller.ts src/modules/payments/payments.controller.ts
cp questionnaire.controller.ts src/modules/questionnaire/questionnaire.controller.ts
cp questionnaire.routes.ts src/modules/questionnaire/questionnaire.routes.ts
cp notifications.controller.ts src/modules/notifications/notifications.controller.ts
cp notifications.routes.ts src/modules/notifications/notifications.routes.ts
cp contracts.controller.ts src/modules/contracts/contracts.controller.ts
cp contracts.routes.ts src/modules/contracts/contracts.routes.ts

# Update main routes file
cp routes.ts src/routes.ts
```

### 4. Testing the Payment Flow

#### Step 1: Create a Client
```http
POST http://localhost:4000/api/clients
Authorization: Bearer <SUPER_ADMIN_TOKEN>
Content-Type: application/json

{
  "companyName": "Test Company",
  "contactPerson": "John Doe",
  "email": "john@testcompany.com",
  "phone": "+2348012345678",
  "status": "ACTIVE"
}
```

#### Step 2: Register Client User
```http
POST http://localhost:4000/api/auth/register-client
Authorization: Bearer <SUPER_ADMIN_TOKEN>
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@testcompany.com",
  "phone": "+2348012345678",
  "password": "securePassword123",
  "clientId": "<CLIENT_ID_FROM_STEP_1>"
}
```

#### Step 3: Login as Client
```http
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "john@testcompany.com",
  "password": "securePassword123"
}
```
**Note:** User will have `CLIENT_VIEWER_PENDING` role until payment is made.

#### Step 4: Initiate Payment
```http
POST http://localhost:4000/api/payments/initiate
Authorization: Bearer <CLIENT_TOKEN>
Content-Type: application/json

{
  "clientId": "<CLIENT_ID>",
  "packageType": "DELUXE",
  "totalPrice": 250000,
  "currency": "NGN",
  "services": [
    "Social Media Management",
    "Content Creation",
    "Analytics"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "ref_xyz123",
    "contractId": "contract_abc456"
  }
}
```

#### Step 5: Simulate Webhook (for testing)
In production, Paystack sends this automatically. For local testing:

```http
POST http://localhost:4000/api/payments/webhook
Content-Type: application/json
x-paystack-signature: <COMPUTED_SIGNATURE>

{
  "event": "charge.success",
  "data": {
    "reference": "ref_xyz123",
    "amount": 25000000,
    "currency": "NGN",
    "channel": "card",
    "paid_at": "2025-01-28T10:00:00.000Z",
    "status": "success"
  }
}
```

**What the webhook does:**
1. ✅ Updates Payment → PAID
2. ✅ Updates Contract → AWAITING_QUESTIONNAIRE
3. ✅ Promotes User → CLIENT_VIEWER
4. ✅ Creates notifications for admin and client
5. ✅ Logs audit trail

#### Step 6: Submit Questionnaire
```http
POST http://localhost:4000/api/questionnaire
Authorization: Bearer <CLIENT_TOKEN>
Content-Type: application/json

{
  "contractId": "<CONTRACT_ID>",
  "responses": {
    "businessGoals": "Increase brand awareness and engagement",
    "targetAudience": "Young professionals aged 25-35",
    "competitors": ["Competitor A", "Competitor B"],
    "brandColors": "#FF5733, #3366FF",
    "preferredStyle": "Modern and minimalist",
    "additionalNotes": "We prefer weekly updates"
  }
}
```

**What happens:**
1. ✅ Questionnaire saved
2. ✅ Contract status → READY_FOR_ASSIGNMENT
3. ✅ Admin notification created
4. ✅ Audit log recorded

#### Step 7: Admin Assigns Tasks
```http
POST http://localhost:4000/api/tasks
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "title": "Create social media content calendar",
  "description": "Develop a monthly content calendar for all platforms",
  "priority": "HIGH",
  "dueDate": "2025-02-15T10:00:00.000Z",
  "clientId": "<CLIENT_ID>",
  "assignedToId": "<WORKER_ID>",
  "requiresApproval": true
}
```

#### Step 8: Update Contract Status
```http
PATCH http://localhost:4000/api/contracts/<CONTRACT_ID>/status
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json

{
  "status": "IN_PROGRESS"
}
```

### 5. Client Portal Endpoints

#### Get My Contracts
```http
GET http://localhost:4000/api/contracts/my
Authorization: Bearer <CLIENT_TOKEN>
```

#### Get Contract Details
```http
GET http://localhost:4000/api/contracts/<CONTRACT_ID>
Authorization: Bearer <CLIENT_TOKEN>
```

#### Get Contract Tasks
```http
GET http://localhost:4000/api/contracts/<CONTRACT_ID>/tasks
Authorization: Bearer <CLIENT_TOKEN>
```

#### Get Notifications
```http
GET http://localhost:4000/api/notifications
Authorization: Bearer <CLIENT_TOKEN>
```

#### Mark Notification as Read
```http
PATCH http://localhost:4000/api/notifications/<NOTIFICATION_ID>/read
Authorization: Bearer <CLIENT_TOKEN>
```

## 🔒 Security Notes

### Webhook Signature Verification
The webhook handler verifies Paystack signatures to prevent fraud:

```typescript
const hash = crypto
  .createHmac("sha512", PAYSTACK_SECRET_KEY)
  .update(JSON.stringify(req.body))
  .digest("hex");

if (hash !== req.headers["x-paystack-signature"]) {
  return res.status(401).send("Invalid signature");
}
```

### Testing Webhooks Locally
Use ngrok to expose your local server:
```bash
ngrok http 4000
# Then set webhook URL in Paystack dashboard to:
# https://your-ngrok-url.ngrok.io/api/payments/webhook
```

## 📊 Database Schema Summary

### New Models
- **Contract**: Links client to package/services with payment tracking
- **Payment**: Records all payment transactions from Paystack
- **Questionnaire**: Stores client project requirements
- **Notification**: In-app notifications for all users

### Key Relationships
```
Client → Contract → Payment
             ↓
       Questionnaire
       
User → Notification
User → Payment
```

## 🎯 Complete Workflow States

### User Roles
1. `CLIENT_VIEWER_PENDING` → Signs up, hasn't paid
2. `CLIENT_VIEWER` → Paid, can access portal
3. `WORKER` → Assigned to tasks
4. `SUPER_ADMIN` → Full access

### Contract Lifecycle
1. `AWAITING_PAYMENT` → Created, waiting for payment
2. `AWAITING_QUESTIONNAIRE` → Paid, needs questionnaire
3. `READY_FOR_ASSIGNMENT` → Questionnaire done, ready for tasks
4. `IN_PROGRESS` → Tasks assigned, work ongoing
5. `ON_HOLD` → Temporarily paused
6. `COMPLETE` → Project finished
7. `CANCELLED` → Project cancelled

### Payment States
1. `INITIATED` → Payment link created
2. `PENDING` → Awaiting payment
3. `PAID` → Payment successful
4. `FAILED` → Payment failed
5. `CANCELLED` → Payment cancelled

## 🐛 Common Issues & Solutions

### Issue: Migration fails with enum errors
**Solution:**
```sql
-- Drop and recreate enums if needed
DROP TYPE IF EXISTS "Role" CASCADE;
DROP TYPE IF EXISTS "PaymentStatus" CASCADE;
-- Then run migration again
```

### Issue: Webhook signature verification fails
**Solution:**
- Ensure raw body middleware is used BEFORE express.json()
- Check that PAYSTACK_SECRET_KEY is correct
- Verify you're using the test key for test mode

### Issue: User not promoted after payment
**Solution:**
- Check webhook was received successfully
- Verify payment reference matches
- Check user role was CLIENT_VIEWER_PENDING before payment

## 📈 Next Steps (Optional Enhancements)

1. **Email Notifications**: Add Nodemailer or Resend
   ```bash
   npm install nodemailer
   ```

2. **Advanced Task Management**: 
   - Link tasks to contracts
   - Track time spent
   - Add file attachments

3. **Analytics Dashboard**:
   - Revenue tracking
   - Project completion rates
   - Worker productivity

4. **Multi-currency Support**:
   - Add currency conversion
   - Support USD, EUR, etc.

## ✅ Checklist

- [ ] Updated Prisma schema
- [ ] Ran migrations
- [ ] Added PAYSTACK_SECRET_KEY to .env
- [ ] Copied all controller and route files
- [ ] Tested payment initiation
- [ ] Set up webhook URL (with ngrok for local)
- [ ] Tested webhook handler
- [ ] Verified user role promotion
- [ ] Tested questionnaire submission
- [ ] Tested client portal endpoints
- [ ] Tested notifications

## 🎉 You're Done!

Your AMBO backend now has a complete payment and contract management system. Clients can sign up, pay, fill questionnaires, and track their projects through the portal.

For questions or issues, refer to:
- Paystack Docs: https://paystack.com/docs
- Prisma Docs: https://www.prisma.io/docs
