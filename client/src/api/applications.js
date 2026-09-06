import { request } from './client';

// TODO: replace with AuthContext user once Person D ships real auth.
const DEFAULT_USER_ID = 'dev-user-1';

export const getApplications = (status) => {
  const params = new URLSearchParams({ userId: DEFAULT_USER_ID });
  if (status) params.set('status', status);
  return request(`/applications?${params.toString()}`);
};

export const createApplication = (data) =>
  request('/applications', {
    method: 'POST',
    body: JSON.stringify({ userId: DEFAULT_USER_ID, ...data }),
  });

export const updateApplication = (id, updates) =>
  request(`/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

export const deleteApplication = (id) =>
  request(`/applications/${id}`, { method: 'DELETE' });

export const syncApplicationsToSheets = (googleAccessToken) =>
  request('/applications/sync-sheets', {
    method: 'POST',
    body: JSON.stringify({ userId: DEFAULT_USER_ID, googleAccessToken }),
  });
