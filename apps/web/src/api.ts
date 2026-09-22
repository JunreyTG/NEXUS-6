export type HealthResponse = {
  status: "ok";
  service: "nexus-6-api";
};

export type DatabaseHealthResponse = {
  status: "ok" | "error";
  database: "system";
};

export type AuthUser = {
  email: string;
  role: "ADMIN" | "SUPER_ADMIN";
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export type AdminRecord = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  status: "PENDING" | "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerifyEmailResponse = {
  status: "verified";
  email: string;
  setupToken: string;
};

export type LogCategory = "login" | "audit" | "security" | "dataset-activity" | "database-activity";

export type LogRecord = {
  id: string;
  timestamp: string;
  actorType: "ADMIN" | "SUPER_ADMIN" | "SYSTEM" | "ANONYMOUS";
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  errorCode: string | null;
};

export type LogPage = {
  items: LogRecord[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type DatasetRecord = {
  id: string;
  ownerAdminId: string;
  owner: { id: string; name: string; email: string } | null;
  name: string;
  description: string | null;
  originalFilename: string;
  fileType: "CSV" | "JSON" | "XLSX";
  fileSizeBytes: number | string | null;
  detectedFields: string[];
  recordCount: number | string | null;
  visibility: "PRIVATE" | "PUBLIC";
  status: string;
  createdAt: string;
  updatedAt: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code?: string) {
    super("Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

async function getJson<T>(path: string, acceptedStatuses: number[] = [200], accessToken?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include"
  });
  const body = (await response.json().catch(() => undefined)) as unknown;

  if (!acceptedStatuses.includes(response.status)) {
    throw new ApiError(response.status, getErrorCode(body));
  }

  return body as T;
}

export function getApiHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>("/api/health");
}

export function getDatabaseHealth(): Promise<DatabaseHealthResponse> {
  return getJson<DatabaseHealthResponse>("/api/health/database", [200, 503]);
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/auth/login", { email, password });
}

export function refreshSession(): Promise<AuthResponse> {
  return postJson<AuthResponse>("/api/auth/refresh");
}

export function logout(): Promise<void> {
  return postJson<void>("/api/auth/logout");
}

export function getMe(accessToken: string): Promise<AuthUser> {
  return getJson<AuthUser>("/api/auth/me", [200], accessToken);
}

export function listAdmins(accessToken: string): Promise<AdminRecord[]> {
  return getJson<AdminRecord[]>("/api/admins", [200], accessToken);
}

export function getAdmin(id: string, accessToken: string): Promise<AdminRecord> {
  return getJson<AdminRecord>(`/api/admins/${id}`, [200], accessToken);
}

export function createAdmin(input: { name: string; email: string }, accessToken: string): Promise<AdminRecord> {
  return postJson<AdminRecord>("/api/admins", input, accessToken);
}

export function updateAdmin(id: string, input: { name?: string; email?: string }, accessToken: string): Promise<AdminRecord> {
  return patchJson<AdminRecord>(`/api/admins/${id}`, input, accessToken);
}

export function updateAdminStatus(id: string, status: AdminRecord["status"], accessToken: string): Promise<AdminRecord> {
  return patchJson<AdminRecord>(`/api/admins/${id}/status`, { status }, accessToken);
}

export function resendVerification(id: string, accessToken: string): Promise<{ status: "verification_sent" }> {
  return postJson<{ status: "verification_sent" }>(`/api/admins/${id}/resend-verification`, undefined, accessToken);
}

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return getJson<VerifyEmailResponse>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function setPassword(token: string, password: string, passwordConfirmation: string): Promise<{ status: "active"; admin: AdminRecord }> {
  return postJson<{ status: "active"; admin: AdminRecord }>("/api/auth/set-password", {
    token,
    password,
    passwordConfirmation
  });
}

export function listLogs(category: LogCategory, query: Record<string, string>, accessToken: string): Promise<LogPage> {
  const search = new URLSearchParams(query);
  return getJson<LogPage>(`/api/logs/${category}?${search.toString()}`, [200], accessToken);
}

export function listDatasets(accessToken: string): Promise<DatasetRecord[]> {
  return getJson<DatasetRecord[]>("/api/datasets", [200], accessToken);
}

export function getDataset(id: string, accessToken: string): Promise<DatasetRecord> {
  return getJson<DatasetRecord>(`/api/datasets/${id}`, [200], accessToken);
}

export function updateDataset(id: string, input: { name?: string; description?: string; visibility?: DatasetRecord["visibility"] }, accessToken: string): Promise<DatasetRecord> {
  return patchJson<DatasetRecord>(`/api/datasets/${id}`, input, accessToken);
}

export function deleteDataset(id: string, accessToken: string): Promise<void> {
  return deleteJson<void>(`/api/datasets/${id}`, accessToken);
}

export function uploadDataset(input: { file: File; name: string; description: string; visibility: DatasetRecord["visibility"]; ownerAdminId?: string }, accessToken: string): Promise<DatasetRecord> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("name", input.name);
  body.append("description", input.description);
  body.append("visibility", input.visibility);
  if (input.ownerAdminId) body.append("ownerAdminId", input.ownerAdminId);
  return multipartPostJson<DatasetRecord>("/api/datasets/upload", body, accessToken);
}

async function postJson<T>(path: string, body?: unknown, accessToken?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include"
  });

  const responseBody = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    throw new ApiError(response.status, getErrorCode(responseBody));
  }
  return responseBody as T;
}

async function patchJson<T>(path: string, body: unknown, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    credentials: "include"
  });
  const responseBody = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) throw new ApiError(response.status, getErrorCode(responseBody));
  return responseBody as T;
}

async function deleteJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include" });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as unknown;
    throw new ApiError(response.status, getErrorCode(body));
  }
  return undefined as T;
}

async function multipartPostJson<T>(path: string, body: FormData, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body, credentials: "include" });
  const responseBody = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) throw new ApiError(response.status, getErrorCode(responseBody));
  return responseBody as T;
}

function getErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("error" in body)) return undefined;
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error) || typeof error.code !== "string") return undefined;
  return error.code;
}
