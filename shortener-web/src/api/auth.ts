import { request } from './client';
import type { ApiResult, AuthResponse } from './types';

export const login = (email: string, password: string): Promise<ApiResult<AuthResponse>> =>
  request<AuthResponse>({ path: '/api/auth/login', method: 'POST', body: { email, password } });

export const register = (email: string, password: string): Promise<ApiResult<void>> =>
  request<void>({ path: '/api/auth/register', method: 'POST', body: { email, password } });
