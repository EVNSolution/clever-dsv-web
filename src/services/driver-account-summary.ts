// Pure helpers for the administrator's driver account lookup. Kept free of imports so the
// unit tests can load this module directly.

export type DriverAccountSummary = {
  lastUsedAt: string | null;
  loginId: string | null;
  sessionExpiresAt: string | null;
  status: string;
};

export function parseDriverAccountSummary(value: unknown): DriverAccountSummary | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.status !== 'string') return null;
  return {
    lastUsedAt: isoOrNull(record.lastUsedAt),
    loginId: typeof record.loginId === 'string' && record.loginId.length > 0 ? record.loginId : null,
    sessionExpiresAt: isoOrNull(record.sessionExpiresAt),
    status: record.status,
  };
}

export function describeSessionState(summary: DriverAccountSummary, now: number = Date.now()): string {
  if (summary.sessionExpiresAt === null) return '앱 로그인 기록 없음';
  const expiresAt = Date.parse(summary.sessionExpiresAt);
  const lastUsed = summary.lastUsedAt === null ? '' : ` · 마지막 사용 ${formatKoreanDateTime(summary.lastUsedAt)}`;
  return expiresAt > now
    ? `앱 로그인 유지 중 (만료 ${formatKoreanDateTime(summary.sessionExpiresAt)})${lastUsed}`
    : `앱 세션 만료 (${formatKoreanDateTime(summary.sessionExpiresAt)}) · 재로그인 필요${lastUsed}`;
}

export function describeAccountStatus(status: string): string {
  return status === 'ACTIVE' ? '활성' : status === 'DISABLED' ? '비활성' : status;
}

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function formatKoreanDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
}
