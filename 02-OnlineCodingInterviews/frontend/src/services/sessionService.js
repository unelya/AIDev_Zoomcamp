import { API_BASE_URL } from '../config';

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Unexpected server error');
  }
  return response.json();
};

export const createSession = async (language) => {
  const response = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
  return handleResponse(response);
};

export const fetchSession = async (sessionId) => {
  const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
  return handleResponse(response);
};
