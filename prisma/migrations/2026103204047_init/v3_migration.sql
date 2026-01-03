-- ============================================
-- AMBO V3 MIGRATION
-- Run this SQL in order on your PostgreSQL database
-- ============================================

-- ============================================
-- PART 1: CREATE NEW TABLES
-- ============================================

-- Create Package table
CREATE TABLE IF NOT EXISTS "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10, 2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customFeatures" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- Create unique index on Package name
CREATE UNIQUE INDEX IF NOT EXISTS "Package_name_key" ON "Package"("name");

-- Create index for active packages sorted
CREATE INDEX IF NOT EXISTS "Package_isActive_sortOrder_idx" ON "Package"("isActive", "sortOrder");

-- Create Service table
CREATE TABLE IF NOT EXISTS "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10, 2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- Create index for active services sorted
CREATE INDEX IF NOT EXISTS "Service_isActive_sortOrder_idx" ON "Service"("isActive", "sortOrder");

-- Create PackageService junction table
CREATE TABLE IF NOT EXISTS "PackageService" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "PackageService_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for package-service pair
CREATE UNIQUE INDEX IF NOT EXISTS "PackageService_packageId_serviceId_key" ON "PackageService"("packageId", "serviceId");

-- Create indexes for PackageService
CREATE INDEX IF NOT EXISTS "PackageService_packageId_idx" ON "PackageService"("packageId");
CREATE INDEX IF NOT EXISTS "PackageService_serviceId_idx" ON "PackageService"("serviceId");

-- Add foreign keys for PackageService
ALTER TABLE "PackageService" 
ADD CONSTRAINT "PackageService_packageId_fkey" 
FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackageService" 
ADD CONSTRAINT "PackageService_serviceId_fkey" 
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- PART 2: UPDATE PLATFORM SETTINGS
-- ============================================

-- Add new columns to PlatformSettings
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "privacyPolicy" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "termsUpdatedAt" TIMESTAMP(3);
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "privacyUpdatedAt" TIMESTAMP(3);

-- ============================================
-- PART 3: UPDATE TASK PRIORITY ENUM
-- ============================================

-- Step 1: Add new enum values (PostgreSQL allows this)
ALTER TYPE "TaskPriority" ADD VALUE IF NOT EXISTS 'PRIORITY';

-- Step 2: Migrate existing data
-- Tasks with contracts = CRITICAL
-- Tasks without contracts = PRIORITY
-- Mixed (has contract) = CRITICAL

UPDATE "Task" 
SET "priority" = 'CRITICAL' 
WHERE "contractId" IS NOT NULL;

UPDATE "Task" 
SET "priority" = 'PRIORITY' 
WHERE "contractId" IS NULL 
AND "priority" IN ('LOW', 'MEDIUM', 'HIGH');

-- Note: We cannot remove enum values in PostgreSQL easily
-- The OLD values (LOW, MEDIUM, HIGH) will remain in the enum but won't be used
-- Future task creation will only use PRIORITY or CRITICAL

-- ============================================
-- PART 4: SEED SERVICES DATA
-- ============================================

-- Insert the 14 standalone services with current pricing
INSERT INTO "Service" ("id", "name", "description", "price", "currency", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
    ('svc_social_media', 'Social Media Management', 'Complete social media strategy and management across all platforms', 449.00, 'USD', true, 1, NOW(), NOW()),
    ('svc_content_marketing', 'Content Marketing', 'Blog posts, articles, and content strategy', 399.00, 'USD', true, 2, NOW(), NOW()),
    ('svc_seo', 'SEO Optimization', 'Search engine optimization to improve your online visibility', 499.00, 'USD', true, 3, NOW(), NOW()),
    ('svc_email_marketing', 'Email Marketing', 'Email campaigns, newsletters, and automation', 299.00, 'USD', true, 4, NOW(), NOW()),
    ('svc_ppc', 'PPC Advertising', 'Pay-per-click advertising management', 599.00, 'USD', true, 5, NOW(), NOW()),
    ('svc_brand_strategy', 'Brand Strategy', 'Brand identity development and positioning', 699.00, 'USD', true, 6, NOW(), NOW()),
    ('svc_web_design', 'Website Design', 'Professional website design and development', 1299.00, 'USD', true, 7, NOW(), NOW()),
    ('svc_analytics', 'Analytics & Reporting', 'Data analysis and performance reporting', 349.00, 'USD', true, 8, NOW(), NOW()),
    ('svc_video_marketing', 'Video Marketing', 'Video content creation and marketing', 799.00, 'USD', true, 9, NOW(), NOW()),
    ('svc_influencer', 'Influencer Marketing', 'Influencer partnerships and campaigns', 899.00, 'USD', true, 10, NOW(), NOW()),
    ('svc_pr', 'Public Relations', 'Media relations and press coverage', 749.00, 'USD', true, 11, NOW(), NOW()),
    ('svc_copywriting', 'Copywriting', 'Professional copywriting for all marketing materials', 399.00, 'USD', true, 12, NOW(), NOW()),
    ('svc_graphic_design', 'Graphic Design', 'Visual design for marketing materials', 449.00, 'USD', true, 13, NOW(), NOW()),
    ('svc_market_research', 'Market Research', 'Market analysis and competitive research', 549.00, 'USD', true, 14, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ============================================
-- PART 5: SEED PACKAGES DATA
-- ============================================

-- Insert the 3 main packages
INSERT INTO "Package" ("id", "name", "displayName", "description", "price", "currency", "isActive", "sortOrder", "customFeatures", "createdAt", "updatedAt")
VALUES
    ('pkg_classic', 'CLASSIC', 'AMBO CLASSIC', 'Perfect for small businesses starting their digital marketing journey', 2249.00, 'USD', true, 1, '["Monthly Strategy Call", "Basic Analytics Dashboard", "Email Support"]'::jsonb, NOW(), NOW()),
    ('pkg_deluxe', 'DELUXE', 'AMBO DELUXE', 'Comprehensive marketing solution for growing businesses', 2959.00, 'USD', true, 2, '["Bi-Weekly Strategy Calls", "Advanced Analytics Dashboard", "Priority Email Support", "Dedicated Account Manager"]'::jsonb, NOW(), NOW()),
    ('pkg_premium', 'PREMIUM', 'AMBO PREMIUM', 'Full-service marketing partnership for established businesses', 3876.00, 'USD', true, 3, '["Weekly Strategy Calls", "Custom Analytics Dashboard", "24/7 Priority Support", "Dedicated Senior Account Manager", "Quarterly Business Reviews"]'::jsonb, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- ============================================
-- PART 6: LINK PACKAGES TO SERVICES
-- ============================================

-- CLASSIC Package: Social Media, Content Marketing, SEO, Email Marketing
INSERT INTO "PackageService" ("id", "packageId", "serviceId", "createdAt")
VALUES
    ('ps_classic_social', 'pkg_classic', 'svc_social_media', NOW()),
    ('ps_classic_content', 'pkg_classic', 'svc_content_marketing', NOW()),
    ('ps_classic_seo', 'pkg_classic', 'svc_seo', NOW()),
    ('ps_classic_email', 'pkg_classic', 'svc_email_marketing', NOW())
ON CONFLICT ("packageId", "serviceId") DO NOTHING;

-- DELUXE Package: All Classic + PPC, Brand Strategy, Analytics
INSERT INTO "PackageService" ("id", "packageId", "serviceId", "createdAt")
VALUES
    ('ps_deluxe_social', 'pkg_deluxe', 'svc_social_media', NOW()),
    ('ps_deluxe_content', 'pkg_deluxe', 'svc_content_marketing', NOW()),
    ('ps_deluxe_seo', 'pkg_deluxe', 'svc_seo', NOW()),
    ('ps_deluxe_email', 'pkg_deluxe', 'svc_email_marketing', NOW()),
    ('ps_deluxe_ppc', 'pkg_deluxe', 'svc_ppc', NOW()),
    ('ps_deluxe_brand', 'pkg_deluxe', 'svc_brand_strategy', NOW()),
    ('ps_deluxe_analytics', 'pkg_deluxe', 'svc_analytics', NOW())
ON CONFLICT ("packageId", "serviceId") DO NOTHING;

-- PREMIUM Package: All Deluxe + Video, Influencer, PR, Web Design
INSERT INTO "PackageService" ("id", "packageId", "serviceId", "createdAt")
VALUES
    ('ps_premium_social', 'pkg_premium', 'svc_social_media', NOW()),
    ('ps_premium_content', 'pkg_premium', 'svc_content_marketing', NOW()),
    ('ps_premium_seo', 'pkg_premium', 'svc_seo', NOW()),
    ('ps_premium_email', 'pkg_premium', 'svc_email_marketing', NOW()),
    ('ps_premium_ppc', 'pkg_premium', 'svc_ppc', NOW()),
    ('ps_premium_brand', 'pkg_premium', 'svc_brand_strategy', NOW()),
    ('ps_premium_analytics', 'pkg_premium', 'svc_analytics', NOW()),
    ('ps_premium_video', 'pkg_premium', 'svc_video_marketing', NOW()),
    ('ps_premium_influencer', 'pkg_premium', 'svc_influencer', NOW()),
    ('ps_premium_pr', 'pkg_premium', 'svc_pr', NOW()),
    ('ps_premium_web', 'pkg_premium', 'svc_web_design', NOW())
ON CONFLICT ("packageId", "serviceId") DO NOTHING;

-- ============================================
-- PART 7: SEED DEFAULT TERMS & PRIVACY
-- ============================================

UPDATE "PlatformSettings"
SET 
    "termsAndConditions" = '<h1>Terms and Conditions</h1>
<p><strong>Last Updated:</strong> January 2026</p>

<h2>1. Introduction</h2>
<p>Welcome to AMBO Digital Marketing Platform. By accessing or using our services, you agree to be bound by these Terms and Conditions.</p>

<h2>2. Services</h2>
<p>AMBO provides digital marketing services including but not limited to:</p>
<ul>
<li>Social Media Management</li>
<li>Content Marketing</li>
<li>SEO Optimization</li>
<li>Email Marketing</li>
<li>PPC Advertising</li>
<li>Brand Strategy</li>
</ul>

<h2>3. Payment Terms</h2>
<p>All payments are processed securely through Paystack. Prices are displayed in USD and are subject to change with notice.</p>

<h2>4. Client Responsibilities</h2>
<p>Clients agree to:</p>
<ul>
<li>Provide accurate and complete information</li>
<li>Respond to questionnaires and requests in a timely manner</li>
<li>Review and approve deliverables as required</li>
<li>Make payments on time</li>
</ul>

<h2>5. Intellectual Property</h2>
<p>Upon full payment, clients receive ownership of deliverables created specifically for their campaigns. AMBO retains the right to showcase work in portfolios.</p>

<h2>6. Confidentiality</h2>
<p>Both parties agree to maintain confidentiality of proprietary information shared during the engagement.</p>

<h2>7. Limitation of Liability</h2>
<p>AMBO''s liability is limited to the amount paid for services. We are not liable for indirect, incidental, or consequential damages.</p>

<h2>8. Termination</h2>
<p>Either party may terminate services with 30 days written notice. Refunds are prorated based on work completed.</p>

<h2>9. Contact</h2>
<p>For questions about these terms, please contact our support team.</p>',

    "privacyPolicy" = '<h1>Privacy Policy</h1>
<p><strong>Last Updated:</strong> January 2026</p>

<h2>1. Information We Collect</h2>
<p>We collect information you provide directly, including:</p>
<ul>
<li>Name and contact information</li>
<li>Company details</li>
<li>Payment information (processed securely by Paystack)</li>
<li>Project requirements and questionnaire responses</li>
<li>Communication history</li>
</ul>

<h2>2. How We Use Your Information</h2>
<p>We use collected information to:</p>
<ul>
<li>Provide and improve our services</li>
<li>Process payments</li>
<li>Communicate with you about your projects</li>
<li>Send relevant updates and notifications</li>
<li>Comply with legal obligations</li>
</ul>

<h2>3. Information Sharing</h2>
<p>We do not sell your personal information. We may share information with:</p>
<ul>
<li>Service providers who assist in our operations</li>
<li>Legal authorities when required by law</li>
<li>Team members assigned to your projects</li>
</ul>

<h2>4. Data Security</h2>
<p>We implement industry-standard security measures to protect your data, including encryption and secure servers.</p>

<h2>5. Your Rights</h2>
<p>You have the right to:</p>
<ul>
<li>Access your personal information</li>
<li>Request correction of inaccurate data</li>
<li>Request deletion of your data</li>
<li>Opt out of marketing communications</li>
</ul>

<h2>6. Cookies</h2>
<p>We use cookies to improve your experience on our platform. You can control cookie settings in your browser.</p>

<h2>7. Changes to This Policy</h2>
<p>We may update this policy periodically. We will notify you of significant changes via email or platform notification.</p>

<h2>8. Contact Us</h2>
<p>For privacy-related questions, please contact our support team.</p>',

    "termsUpdatedAt" = NOW(),
    "privacyUpdatedAt" = NOW(),
    "updatedAt" = NOW()
WHERE "id" = 'default';

-- If no default settings exist, create them
INSERT INTO "PlatformSettings" ("id", "termsAndConditions", "privacyPolicy", "termsUpdatedAt", "privacyUpdatedAt", "updatedAt")
SELECT 'default', 
    '<h1>Terms and Conditions</h1><p>Please configure your terms and conditions.</p>',
    '<h1>Privacy Policy</h1><p>Please configure your privacy policy.</p>',
    NOW(), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "PlatformSettings" WHERE "id" = 'default');

-- ============================================
-- DONE!
-- ============================================

-- After running this migration, run: npx prisma generate
