CREATE SCHEMA IF NOT EXISTS "catalog";
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='contract_type') THEN
 CREATE TYPE users.contract_type AS ENUM('permanent', 'fixed_term', 'project', 'contractor', 'internship');
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='industry') THEN
 CREATE TYPE users.industry AS ENUM('software', 'information_technology', 'cybersecurity', 'artificial_intelligence', 'data_analytics', 'cloud_services', 'telecommunications', 'electronics', 'semiconductors', 'video_games', 'internet_services', 'fintech', 'banking', 'insurance', 'investment', 'accounting', 'legal_services', 'consulting', 'business_services', 'human_resources', 'staffing', 'retail', 'ecommerce', 'wholesale', 'consumer_goods', 'fashion', 'beauty', 'luxury', 'food_beverage', 'restaurants', 'hospitality', 'tourism', 'events', 'entertainment', 'media', 'advertising', 'marketing', 'publishing', 'sports', 'fitness', 'manufacturing', 'automotive', 'aerospace', 'defense', 'construction', 'architecture', 'real_estate', 'engineering', 'energy', 'renewables', 'oil_gas', 'mining', 'agriculture', 'livestock', 'fishing', 'forestry', 'chemicals', 'pharmaceuticals', 'biotechnology', 'medical_devices', 'healthcare', 'mental_health', 'education', 'research', 'nonprofit', 'government', 'public_administration', 'international_organizations', 'transportation', 'logistics', 'shipping', 'aviation', 'maritime', 'warehousing', 'utilities', 'environmental_services', 'waste_management', 'water_services', 'security_services', 'cleaning_services', 'home_services', 'customer_support');
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='salary_period') THEN
 CREATE TYPE users.salary_period AS ENUM('hour', 'month', 'year');
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='seniority') THEN
 CREATE TYPE users.seniority AS ENUM('intern', 'trainee', 'junior', 'mid', 'senior', 'lead_staff', 'manager');
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='work_language') THEN
 CREATE TYPE users.work_language AS ENUM('es', 'en', 'pt', 'fr', 'de', 'it', 'nl', 'pl', 'sv', 'no', 'da', 'fi', 'cs', 'hu', 'ro', 'el', 'uk', 'ru', 'ca', 'gl', 'eu', 'ga', 'tr', 'qu', 'ay', 'gn');
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='work_mode') THEN
 CREATE TYPE users.work_mode AS ENUM('remote', 'hybrid', 'onsite');
 END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='users' AND t.typname='work_schedule') THEN
 CREATE TYPE users.work_schedule AS ENUM('full_time', 'part_time', 'hourly', 'flexible');
 END IF;
END $$;