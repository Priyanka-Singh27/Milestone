// server/src/config/env.js
//
// Validates environment variables at startup so a bad deployment fails LOUDLY
// instead of half-working (for example: a missing JWT_SECRET used to create the
// user and then crash while signing the login token).

function origins(env = process.env) {
  return (env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** The first FRONTEND_URL entry. Used for redirects (Google, Sheets pages). */
function primaryFrontendUrl() {
  return origins()[0] || 'http://localhost:5173';
}

function validateEnv(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  const need = (key, minLen = 1) => {
    if (!env[key] || String(env[key]).length < minLen) {
      errors.push(`${key} is missing${minLen > 1 ? ` or shorter than ${minLen} characters` : ''}.`);
    }
  };

  need('DATABASE_URL');
  need('JWT_SECRET', prod ? 32 : 16);
  need('INTERNAL_API_KEY', prod ? 32 : 8);

  if (env.JWT_SECRET && env.INTERNAL_API_KEY && env.JWT_SECRET === env.INTERNAL_API_KEY) {
    errors.push('JWT_SECRET and INTERNAL_API_KEY must be different values.');
  }

  const list = origins(env);
  if (list.length === 0) {
    (prod ? errors : warnings).push('FRONTEND_URL is not set (CORS and redirects will not work).');
  }
  list.forEach((o) => {
    try {
      const u = new URL(o);
      if (u.pathname !== '/' || u.search || u.hash) {
        errors.push(`FRONTEND_URL entry "${o}" must be an origin only (no path).`);
      }
      if (prod && u.protocol !== 'https:') {
        warnings.push(`FRONTEND_URL entry "${o}" is not https.`);
      }
    } catch {
      errors.push(`FRONTEND_URL entry "${o}" is not a valid URL.`);
    }
  });

  if (env.GOOGLE_CLIENT_ID) {
    if (!env.GOOGLE_CLIENT_SECRET) errors.push('GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is missing.');
    if (!env.GOOGLE_REDIRECT_URI) errors.push('GOOGLE_CLIENT_ID is set but GOOGLE_REDIRECT_URI is missing.');
  } else {
    warnings.push('Google sign-in and Sheets sync are disabled (GOOGLE_CLIENT_ID not set).');
  }

  if ((env.LLM_PROVIDER || 'groq') !== 'mock' && !env.LLM_API_KEY) {
    errors.push('LLM_API_KEY is missing (or set LLM_PROVIDER=mock for local testing).');
  }
  if (prod && env.LLM_PROVIDER === 'mock') {
    errors.push('LLM_PROVIDER=mock must not be used in production.');
  }

  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    warnings.push('Cloudinary is not configured: certificate uploads will fail.');
  }
  if (prod && !env.INTERNAL_API_URL) {
    warnings.push('INTERNAL_API_URL is not set; defaulting to http://localhost:PORT.');
  }

  return { errors, warnings };
}

function assertEnv() {
  const { errors, warnings } = validateEnv();
  warnings.forEach((w) => console.warn(`⚠️  ${w}`));
  if (errors.length) {
    console.error('\n❌ Invalid server configuration:');
    errors.forEach((e) => console.error(`   • ${e}`));
    console.error('\nFix server/.env (or your host\'s environment variables) and restart.\n');
    process.exit(1);
  }
}

module.exports = { validateEnv, assertEnv, origins, primaryFrontendUrl };
