import { request } from './client';
import type { ApiResult, CreateLinkPayload, LinkResponse, LinkStats, Page } from './types';

const resource = (code: string) => `/api/links/${encodeURIComponent(code)}`;

export const createLink = (input: CreateLinkPayload, token: string): Promise<ApiResult<LinkResponse>> =>
  request<LinkResponse>({ path: '/api/links', method: 'POST', body: input, token });

export const listLinks = (page: number, size: number, token: string): Promise<ApiResult<Page<LinkResponse>>> =>
  request<Page<LinkResponse>>({ path: `/api/links?page=${page}&size=${size}`, token });

export const getLink = (code: string, token: string): Promise<ApiResult<LinkResponse>> =>
  request<LinkResponse>({ path: resource(code), token });

export const deleteLink = (code: string, token: string): Promise<ApiResult<void>> =>
  request<void>({ path: resource(code), method: 'DELETE', token });

export const getStats = (code: string, token: string): Promise<ApiResult<LinkStats>> =>
  request<LinkStats>({ path: `${resource(code)}/stats`, token });
