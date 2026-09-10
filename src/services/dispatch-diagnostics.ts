import type { DsvDispatchFailureMetadata } from '../api/client';
import { readAuthToken, readCsrfToken } from '../api/auth-session';
import { apiConfig } from '../api/config';

export type DispatchLoadAttemptKind = 'initial' | 'retry';
export type DispatchLoadOutcome = 'aborted' | 'failure' | 'success';

export type DispatchLoadDiagnostic = {
  attemptId: string;
  attemptKind: DispatchLoadAttemptKind;
  durationMs: number;
  loadId: string;
  outcome: DispatchLoadOutcome;
  serviceDate: string;
  source: 'browser';
} & Partial<DsvDispatchFailureMetadata>;

const REPORT_TIMEOUT_MS = 1_500;

export function reportDispatchLoadAttempt(diagnostic: DispatchLoadDiagnostic): void {
  if (apiConfig.mode !== 'remote') return;
  void sendDispatchLoadAttempt(diagnostic);
}

async function sendDispatchLoadAttempt(diagnostic: DispatchLoadDiagnostic): Promise<void> {
  let timeout: number | undefined;
  try {
    const controller = new AbortController();
    timeout = window.setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
    const token = readAuthToken();
    const csrfToken = readCsrfToken();
    await fetch(`${apiConfig.v1BaseUrl}/diagnostics/dispatch-load`, {
      body: JSON.stringify(diagnostic),
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: controller.signal,
    });
  } catch {
    // Diagnostics must never alter the read, retry, or authentication path.
  } finally {
    try {
      if (timeout !== undefined) window.clearTimeout(timeout);
    } catch {
      // Timer cleanup is part of the same no-impact diagnostic boundary.
    }
  }
}
