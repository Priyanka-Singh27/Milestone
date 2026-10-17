# Setup & Deployment Guide

This guide details how to set up, run, seed, and deploy the PrepRoadmap backend and integration infrastructure.

---

## 1. Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **npm**: `v10.x`+
- **MongoDB Atlas**: Free M0 cluster or self-hosted MongoDB
- **Google Cloud Console**: Project with OAuth 2.0 Credentials (for Google Sign-In)

---

## 2. Local Development Setup

### 2.1 Clone Repository
```bash
git clone https://github.com/Priyanka-Singh27/Milestone.git
cd Milestone
```

### 2.2 Configure Environment Variables
Copy `.env.example` to `server/.env`:
```bash
cp .env.example server/.env
```

Populate the following required variables in `server/.env`:
```ini
DATABASE_URL=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/prep_roadmap_app?retryWrites=true&w=majority
JWT_SECRET=your-secure-jwt-secret-at-least-32-chars
INTERNAL_API_KEY=your-secure-internal-service-key
INTERNAL_API_URL=http://localhost:5000/api/v1
FRONTEND_URL=http://localhost:3000
DEV_USER_PASSWORD=devpassword123
LLM_API_KEY=your-llm-api-key
LLM_PROVIDER=groq

# Google OAuth (optional for local email/password testing, required for OAuth flow)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/v1/auth/google/callback
```

### 2.3 Install Server Dependencies
```bash
cd server
npm install
```

### 2.4 MongoDB Atlas IP Whitelisting (Important)
If connecting to MongoDB Atlas from a new network or developer machine:
1. Log into [MongoDB Atlas](https://cloud.mongodb.com/).
2. Navigate to **Security** → **Network Access**.
3. Click **Add IP Address**.
4. Choose either:
   - **Add Current IP Address** (secure for local dev), or
   - **Allow Access from Anywhere** (`0.0.0.0/0`) for dev environments / dynamic cloud hosts like Render.
5. Wait ~1 minute for Atlas status to turn Active.

### 2.5 Run Database Seed
Seed the shared developer placeholder user (`dev-user-1` / `dev@preproadmap.local`):
```bash
npm run seed:users
```
*Note: This script is idempotent and safe to run multiple times without duplicating data.*

### 2.6 Run Test Suite
The automated test suite uses Node's native runner (`node:test`) and an in-memory MongoDB server, so it never touches your production Atlas database:
```bash
npm test
```

### 2.7 Start Server
```bash
npm run dev
# Server will listen on http://localhost:5000
```

---

## 3. Google OAuth 2.0 Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project (shared between Person D OAuth and Person C Sheets API).
3. Navigate to **APIs & Services** → **OAuth consent screen**:
   - User Type: **External**
   - App Name: `PrepRoadmap`
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - Add Test Users if app is in Testing mode.
4. Navigate to **Credentials** → **Create Credentials** → **OAuth Client ID**:
   - Application Type: **Web application**
   - Name: `PrepRoadmap Web Client`
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (local dev)
     - `https://your-frontend-app.vercel.app` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:5000/api/v1/auth/google/callback` (local dev)
     - `https://your-backend-app.onrender.com/api/v1/auth/google/callback` (production)
5. Copy the generated **Client ID** and **Client Secret** into your `.env` or Render dashboard.

---

## 4. Production Deployment

### 4.1 Backend on Render
The repository includes [`render.yaml`](../render.yaml) for automated Blueprint deployment:
1. Log in to [Render](https://dashboard.render.com/).
2. Click **New** → **Blueprint**.
3. Connect your GitHub repository.
4. Render will parse `render.yaml` and configure the `prep-roadmap-server` Web Service.
5. Fill in the non-synced environment variables in the Render Dashboard:
   - `DATABASE_URL`
   - `FRONTEND_URL`
   - `LLM_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
6. Click **Apply**.

### 4.2 Frontend on Vercel
1. Import the repository in [Vercel](https://vercel.com/).
2. Set Root Directory to `client`.
3. Set Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-backend-app.onrender.com/api/v1`
4. Deploy.
