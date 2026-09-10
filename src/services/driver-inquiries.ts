import { requestLegacyJson } from '../api/client';

export type DriverInquiry = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export async function loadDriverInquiries(cursor: string | null, signal: AbortSignal): Promise<{ items: DriverInquiry[]; nextCursor: string | null }> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor !== null) query.set('cursor', cursor);
  const data = await requestLegacyJson<unknown>(`driver-inquiries?${query}`, { cache: 'no-store', signal });
  if (!isObject(data) || !Array.isArray(data.items) || !(data.nextCursor === null || (typeof data.nextCursor === 'string' && data.nextCursor !== ''))) {
    throw new Error('문의 응답 형식이 올바르지 않습니다.');
  }
  return { items: data.items.map(parseInquiry), nextCursor: data.nextCursor };
}

export async function loadDriverInquiry(id: string, signal: AbortSignal): Promise<DriverInquiry> {
  const data = await requestLegacyJson<unknown>(`driver-inquiries/${encodeURIComponent(id)}`, { cache: 'no-store', signal });
  const inquiry = parseInquiry(isObject(data) ? data.inquiry : undefined);
  if (inquiry.id !== id) throw new Error('문의 응답 형식이 올바르지 않습니다.');
  return inquiry;
}

function parseInquiry(value: unknown): DriverInquiry {
  if (!isObject(value)
    || ['id', 'title', 'body', 'authorName', 'createdAt'].some((key) => typeof value[key] !== 'string' || value[key] === '')
    || !Number.isFinite(Date.parse(value.createdAt as string))) {
    throw new Error('문의 응답 형식이 올바르지 않습니다.');
  }
  return { id: value.id as string, title: value.title as string, body: value.body as string, authorName: value.authorName as string, createdAt: value.createdAt as string };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
