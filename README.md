# Chorale Registration Portal — Render + Supabase

This version stores registrations in a hosted Supabase PostgreSQL database, so it is suitable for deployment on Render's free web service without relying on Render's temporary local filesystem.

## 1. Create Supabase database
1. Create a Supabase project.
2. Open SQL Editor.
3. Paste all contents of `supabase-schema.sql` and run it.
4. Go to Project Settings > API.
5. Copy the Project URL and the `service_role` secret key.

IMPORTANT: The service-role key is a secret. Put it only in Render Environment Variables. Never put it in public JavaScript or commit it to GitHub.

## 2. Upload to GitHub
Create a new GitHub repository and upload all files in this folder.
Do not upload a real `.env` file containing secrets.

## 3. Deploy on Render
Create a new Web Service from the GitHub repository.
Build Command: npm install
Start Command: npm start
Choose the Free plan.

Add these Environment Variables in Render:
ADMIN_USERNAME = your admin username
ADMIN_PASSWORD = a strong admin password
SESSION_SECRET = a long random string
SUPABASE_URL = your Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY = your Supabase service_role key
NODE_ENV = production

Render will provide a public https://...onrender.com URL.

## 4. Pages
Public registration: /
Admin dashboard: /admin
Health check: /api/health

## Notes
The admin session is intentionally held in memory, so an admin may need to sign in again after a Render restart. Registration records remain in Supabase.
