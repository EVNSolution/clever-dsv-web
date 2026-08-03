import { requestLegacyJson } from '../api/client';
import { apiConfig } from '../api/config';

export type ManualEmailConfig = {
  apiConfigured: boolean;
  configured: boolean;
  defaultRecipients: string[];
  defaultSubject: string;
  defaultTextContent: string;
  senderEmail: string | null;
  senderName: string;
};

export type ManualEmailDraft = {
  recipients: string[];
  subject: string;
  textContent: string;
};

export async function loadManualEmailConfig(): Promise<ManualEmailConfig> {
  if (apiConfig.mode === 'mock') {
    return { apiConfigured: false, configured: false, defaultRecipients: [], defaultSubject: '', defaultTextContent: '', senderEmail: null, senderName: 'CLEVER DSV' };
  }
  const value = await requestLegacyJson<unknown>('manual-email');
  if (!value || typeof value !== 'object') throw new Error('이메일 설정 응답 형식이 올바르지 않습니다.');
  const configured = Reflect.get(value, 'configured');
  const apiConfigured = Reflect.get(value, 'apiConfigured');
  const defaultRecipients = Reflect.get(value, 'defaultRecipients');
  const defaultSubject = Reflect.get(value, 'defaultSubject');
  const defaultTextContent = Reflect.get(value, 'defaultTextContent');
  const senderEmail = Reflect.get(value, 'senderEmail');
  const senderName = Reflect.get(value, 'senderName');
  if (
    typeof apiConfigured !== 'boolean'
    || typeof configured !== 'boolean'
    || !Array.isArray(defaultRecipients)
    || defaultRecipients.some((recipient) => typeof recipient !== 'string')
    || typeof defaultSubject !== 'string'
    || typeof defaultTextContent !== 'string'
    || (senderEmail !== null && typeof senderEmail !== 'string')
    || typeof senderName !== 'string'
  ) throw new Error('이메일 설정 응답 형식이 올바르지 않습니다.');
  return { apiConfigured, configured, defaultRecipients, defaultSubject, defaultTextContent, senderEmail, senderName };
}

export async function sendManualEmail(draft: ManualEmailDraft): Promise<{ recipientCount: number; sentAt: string }> {
  if (apiConfig.mode === 'mock') throw new Error('수동 이메일은 백엔드 연결 모드에서만 발송할 수 있습니다.');
  return requestLegacyJson('manual-email', {
    method: 'POST',
    json: {
      commandId: crypto.randomUUID(),
      confirmed: true,
      recipients: draft.recipients,
      subject: draft.subject,
      textContent: draft.textContent,
    },
  });
}

export function recipientsFromInput(value: string): string[] {
  return [...new Set(value.split(',').map((recipient) => recipient.trim().toLowerCase()).filter(Boolean))];
}
