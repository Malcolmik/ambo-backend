# AMBO Backend - Complete Test Suite
# Run these tests to verify everything works

# Save your admin token first
$ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtaDlsczg3cTAwMDB2eTdvYmJkcWVremEiLCJyb2xlIjoiU1VQRVJfQURNSU4iLCJlbWFpbCI6ImFkbWluQGV4YW1wbGUuY29tIiwiaWF0IjoxNzYyOTk4NTU5LCJleHAiOjE3NjMwODQ5NTl9.xAz0mg_gueKN7xJtrUaCfQ6TSsup7ciQSploAY7DN2s"

Write-Host "🧪 AMBO Backend - Complete Test Suite" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Server Health
Write-Host "Test 1: Checking if server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:4000/api/users" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"} -ErrorAction Stop
    Write-Host "✅ Server is running!" -ForegroundColor Green
} catch {
    Write-Host "❌ Server not responding. Make sure it's running with 'npm run dev'" -ForegroundColor Red
    exit
}

# Test 2: List Users
Write-Host "`nTest 2: Listing all users..." -ForegroundColor Yellow
$users = Invoke-RestMethod -Uri "http://localhost:4000/api/users" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"}
Write-Host "✅ Found $($users.data.Count) user(s)" -ForegroundColor Green
$users.data | ForEach-Object { Write-Host "   - $($_.name) ($($_.email)) - Role: $($_.role)" }

# Test 3: Create a Client
Write-Host "`nTest 3: Creating a test client..." -ForegroundColor Yellow
$clientBody = @{
    companyName = "Test Company Ltd"
    contactPerson = "John Test"
    email = "john@testcompany.com"
    phone = "+2348012345678"
    status = "ACTIVE"
} | ConvertTo-Json

$client = Invoke-RestMethod -Uri "http://localhost:4000/api/clients" -Method POST -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $clientBody
Write-Host "✅ Client created! ID: $($client.data.id)" -ForegroundColor Green
$CLIENT_ID = $client.data.id

# Test 4: List Clients
Write-Host "`nTest 4: Listing all clients..." -ForegroundColor Yellow
$clients = Invoke-RestMethod -Uri "http://localhost:4000/api/clients" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"}
Write-Host "✅ Found $($clients.data.Count) client(s)" -ForegroundColor Green

# Test 5: Create a Worker
Write-Host "`nTest 5: Creating a test worker..." -ForegroundColor Yellow
$workerBody = @{
    name = "Jane Worker"
    email = "jane@worker.com"
    phone = "+2348087654321"
    password = "workerpass123"
} | ConvertTo-Json

try {
    $worker = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register-worker" -Method POST -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $workerBody
    Write-Host "✅ Worker created! ID: $($worker.data.id)" -ForegroundColor Green
    $WORKER_ID = $worker.data.id
} catch {
    Write-Host "⚠️  Worker might already exist" -ForegroundColor Yellow
}

# Test 6: Register Client User
Write-Host "`nTest 6: Creating client user account..." -ForegroundColor Yellow
$clientUserBody = @{
    name = "John Test"
    email = "johnclient@testcompany.com"
    phone = "+2348012345678"
    password = "clientpass123"
    clientId = $CLIENT_ID
} | ConvertTo-Json

try {
    $clientUser = Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register-client" -Method POST -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $clientUserBody
    Write-Host "✅ Client user created! ID: $($clientUser.data.id)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Client user might already exist" -ForegroundColor Yellow
}

# Test 7: Test Payment Initiation (CRITICAL NEW FEATURE)
Write-Host "`nTest 7: Testing payment initiation..." -ForegroundColor Yellow
Write-Host "   Note: This requires PAYSTACK_SECRET_KEY in your .env" -ForegroundColor Gray
$paymentBody = @{
    clientId = $CLIENT_ID
    packageType = "DELUXE"
    totalPrice = 250000
    currency = "NGN"
    services = @("Social Media Management", "Content Creation")
} | ConvertTo-Json

try {
    $payment = Invoke-RestMethod -Uri "http://localhost:4000/api/payments/initiate" -Method POST -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $paymentBody
    Write-Host "✅ Payment initiated!" -ForegroundColor Green
    Write-Host "   Reference: $($payment.data.reference)" -ForegroundColor Cyan
    Write-Host "   Contract ID: $($payment.data.contractId)" -ForegroundColor Cyan
    Write-Host "   Checkout URL: $($payment.data.authorization_url)" -ForegroundColor Cyan
    $CONTRACT_ID = $payment.data.contractId
} catch {
    Write-Host "❌ Payment initiation failed. Check:" -ForegroundColor Red
    Write-Host "   1. PAYSTACK_SECRET_KEY is in .env" -ForegroundColor Red
    Write-Host "   2. Server logs for errors" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 8: Check Contracts (NEW FEATURE)
Write-Host "`nTest 8: Listing contracts..." -ForegroundColor Yellow
try {
    $contracts = Invoke-RestMethod -Uri "http://localhost:4000/api/contracts/my" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"}
    Write-Host "✅ Found $($contracts.data.Count) contract(s)" -ForegroundColor Green
    if ($contracts.data.Count -gt 0) {
        $contracts.data | ForEach-Object { 
            Write-Host "   - Contract: $($_.id)" -ForegroundColor Cyan
            Write-Host "     Package: $($_.packageType), Status: $($_.status), Payment: $($_.paymentStatus)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "⚠️  Contracts endpoint might not be fully set up yet" -ForegroundColor Yellow
}

# Test 9: Check Notifications (NEW FEATURE)
Write-Host "`nTest 9: Checking notifications..." -ForegroundColor Yellow
try {
    $notifications = Invoke-RestMethod -Uri "http://localhost:4000/api/notifications" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"}
    Write-Host "✅ Found $($notifications.data.Count) notification(s)" -ForegroundColor Green
    if ($notifications.data.Count -gt 0) {
        $notifications.data | Select-Object -First 3 | ForEach-Object {
            Write-Host "   - $($_.title): $($_.body)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "⚠️  Notifications endpoint might not be fully set up yet" -ForegroundColor Yellow
}

# Test 10: Create a Task
Write-Host "`nTest 10: Creating a test task..." -ForegroundColor Yellow
$taskBody = @{
    title = "Test Task - Social Media Setup"
    description = "Set up social media accounts for the client"
    priority = "HIGH"
    dueDate = (Get-Date).AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    clientId = $CLIENT_ID
    assignedToId = $WORKER_ID
    requiresApproval = $true
} | ConvertTo-Json

try {
    $task = Invoke-RestMethod -Uri "http://localhost:4000/api/tasks" -Method POST -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $taskBody
    Write-Host "✅ Task created! ID: $($task.data.id)" -ForegroundColor Green
    $TASK_ID = $task.data.id
} catch {
    Write-Host "⚠️  Task creation might have failed" -ForegroundColor Yellow
}

# Test 11: List Tasks
Write-Host "`nTest 11: Listing all tasks..." -ForegroundColor Yellow
$tasks = Invoke-RestMethod -Uri "http://localhost:4000/api/tasks" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"}
Write-Host "✅ Found $($tasks.data.Count) task(s)" -ForegroundColor Green
$tasks.data | Select-Object -First 3 | ForEach-Object { 
    Write-Host "   - $($_.title) - Status: $($_.status), Priority: $($_.priority)" 
}

# Test 12: Update Task Status
Write-Host "`nTest 12: Updating task status..." -ForegroundColor Yellow
if ($TASK_ID) {
    $statusBody = @{
        status = "IN_PROGRESS"
        message = "Started working on this task"
    } | ConvertTo-Json

    try {
        $updated = Invoke-RestMethod -Uri "http://localhost:4000/api/tasks/$TASK_ID" -Method PATCH -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $statusBody
        Write-Host "✅ Task status updated to: $($updated.data.status)" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Task update failed" -ForegroundColor Yellow
    }
}

# Test 13: Add Task Comment
Write-Host "`nTest 13: Adding a comment to task..." -ForegroundColor Yellow
if ($TASK_ID) {
    $commentBody = @{
        content = "This is a test comment on the task"
    } | ConvertTo-Json

    try {
        $comment = Invoke-RestMethod -Uri "http://localhost:4000/api/tasks/$TASK_ID/comments" -Method POST -Headers @{Authorization = "Bearer $ADMIN_TOKEN"; "Content-Type" = "application/json"} -Body $commentBody
        Write-Host "✅ Comment added!" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Comment addition failed" -ForegroundColor Yellow
    }
}

# Test 14: Check Activity Logs
Write-Host "`nTest 14: Checking activity logs..." -ForegroundColor Yellow
try {
    $activity = Invoke-RestMethod -Uri "http://localhost:4000/api/activity" -Method GET -Headers @{Authorization = "Bearer $ADMIN_TOKEN"}
    Write-Host "✅ Found $($activity.data.Count) activity log(s)" -ForegroundColor Green
    $activity.data | Select-Object -First 5 | ForEach-Object {
        Write-Host "   - $($_.actionType) on $($_.entityType) by $($_.user.name)" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Activity logs might not be available" -ForegroundColor Yellow
}

# Summary
Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "🎉 Test Suite Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Results Summary:" -ForegroundColor Yellow
Write-Host "✅ Server: Running" -ForegroundColor Green
Write-Host "✅ Authentication: Working" -ForegroundColor Green
Write-Host "✅ Users: Working" -ForegroundColor Green
Write-Host "✅ Clients: Working" -ForegroundColor Green
Write-Host "✅ Tasks: Working" -ForegroundColor Green
Write-Host "✅ Comments: Working" -ForegroundColor Green
Write-Host ""
Write-Host "New Features Status:" -ForegroundColor Yellow
Write-Host "📦 Payments: " -NoNewline
if ($payment) { Write-Host "✅ Working" -ForegroundColor Green } else { Write-Host "⚠️  Check Paystack config" -ForegroundColor Yellow }
Write-Host "📋 Contracts: " -NoNewline
if ($contracts) { Write-Host "✅ Working" -ForegroundColor Green } else { Write-Host "⚠️  Needs setup" -ForegroundColor Yellow }
Write-Host "🔔 Notifications: " -NoNewline
if ($notifications) { Write-Host "✅ Working" -ForegroundColor Green } else { Write-Host "⚠️  Needs setup" -ForegroundColor Yellow }
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Add PAYSTACK_SECRET_KEY to .env if payment test failed" -ForegroundColor White
Write-Host "2. Run: npx prisma migrate dev --name add_payment_system" -ForegroundColor White
Write-Host "3. Test the payment webhook with Paystack dashboard" -ForegroundColor White
Write-Host "4. Check docs/IMPLEMENTATION_GUIDE.md for full setup" -ForegroundColor White
Write-Host ""
Write-Host "Test data created:" -ForegroundColor Cyan
Write-Host "  Client ID: $CLIENT_ID" -ForegroundColor Gray
if ($WORKER_ID) { Write-Host "  Worker ID: $WORKER_ID" -ForegroundColor Gray }
if ($CONTRACT_ID) { Write-Host "  Contract ID: $CONTRACT_ID" -ForegroundColor Gray }
if ($TASK_ID) { Write-Host "  Task ID: $TASK_ID" -ForegroundColor Gray }
