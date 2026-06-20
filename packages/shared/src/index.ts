// Types and utilities shared between the API and the web frontend.

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface ApiError {
  error: string;
  message: string;
}
