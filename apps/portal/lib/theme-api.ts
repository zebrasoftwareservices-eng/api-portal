// SPDX-License-Identifier: Apache-2.0
'use client';
import { api } from './client';
import type { ThemeSettings, ThemeValues } from './theme';
export type ThemeAssetUpload = { contentType: string; data: string };
export type SaveThemeBody = {
  values: ThemeValues;
  logo?: ThemeAssetUpload | null;
  favicon?: ThemeAssetUpload | null;
};
export type ThemeExportFile = {
  format?: string;
  version?: number;
  exportedAt?: string;
  values: ThemeValues;
  logo: ThemeAssetUpload | null;
  favicon: ThemeAssetUpload | null;
};
export type ThemeFieldError = { pointer?: string; message?: string; detail?: string };
export type ThemeFailure = {
  status: number;
  detail?: string;
  errors?: ThemeFieldError[];
};
type Raw = { data?: unknown; error?: unknown; response: Response };
type ThemeClient = {
  GET: (path: string, init?: { params?: { query?: Record<string, string> } }) => Promise<Raw>;
  PUT: (path: string, init: { body: SaveThemeBody }) => Promise<Raw>;
  POST: (path: string, init: { body: ThemeExportFile }) => Promise<Raw>;
  DELETE: (path: string) => Promise<Raw>;
};
const themeApi = api as unknown as ThemeClient;
function failure(error: unknown, response: Response): ThemeFailure {
  const body = (error && typeof error === 'object' ? error : {}) as {
    detail?: string;
    errors?: ThemeFieldError[];
  };
  return { status: response.status, detail: body.detail, errors: body.errors };
}
async function settle<T>(run: () => Promise<Raw>): Promise<{ data?: T; error?: ThemeFailure }> {
  try {
    const result = await run();
    if (result.response.ok && result.data !== undefined) return { data: result.data as T };
    return { error: failure(result.error, result.response) };
  } catch {
    return { error: { status: 0 } };
  }
}
export function getThemeSettings() {
  return settle<ThemeSettings>(() => themeApi.GET('/v1/admin/theme'));
}
export function saveTheme(body: SaveThemeBody) {
  return settle<ThemeSettings>(() => themeApi.PUT('/v1/admin/theme', { body }));
}
export function resetTheme() {
  return settle<ThemeSettings>(() => themeApi.DELETE('/v1/admin/theme'));
}
export function exportTheme() {
  return settle<ThemeExportFile>(() => themeApi.GET('/v1/admin/theme/export'));
}
export function importTheme(body: ThemeExportFile) {
  return settle<ThemeSettings>(() => themeApi.POST('/v1/admin/theme/import', { body }));
}
export async function readFileBytes(file: Blob) {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
export async function readFileText(file: Blob) {
  return new TextDecoder().decode(await readFileBytes(file));
}
export async function fileToData(file: File) {
  const bytes = await readFileBytes(file);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
export function errorDetail(item: ThemeFieldError, fallback: string) {
  return item.detail || item.message || fallback;
}
