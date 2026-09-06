const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;

  if (!res.ok || (body && body.success === false)) {
    const err = new Error(body?.error?.message || `Request failed: ${res.status}`);
    err.code = body?.error?.code || 'UNKNOWN_ERROR';
    throw err;
  }

  return body?.data;
}

// For multipart/form-data requests (file uploads) — kept here for future
// reuse when the certificate/vault phase resumes.
async function requestForm(path, formData, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
    ...options,
  });
  const body = await res.json();

  if (!res.ok || body.success === false) {
    const err = new Error(body?.error?.message || 'Upload failed');
    err.code = body?.error?.code || 'UNKNOWN_ERROR';
    throw err;
  }

  return body.data;
}

export { request, requestForm, BASE_URL };
