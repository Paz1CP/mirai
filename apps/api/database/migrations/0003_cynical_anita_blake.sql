DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='users' AND table_name='candidate_profiles' AND column_name='onboarding_completed') THEN
   ALTER TABLE users.candidate_profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
 END IF;
END $$;
