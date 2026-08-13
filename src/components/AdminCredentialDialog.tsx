import type { FormEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Principal } from '../services/auth';
import { updateCredentials } from '../services/auth';

export function AdminCredentialDialog({
  onClose,
  onUpdated,
}: {
  onClose: () => void;
  onUpdated: (principal: Principal) => void;
}): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const loginId = String(form.get('newLoginId') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const passwordConfirm = String(form.get('passwordConfirm') ?? '');
    if (!loginId && !password) {
      setError('변경할 로그인 아이디 또는 새 비밀번호를 입력하세요.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const principal = await updateCredentials({
        currentPassword,
        ...(loginId ? { loginId } : {}),
        ...(password ? { password } : {}),
      });
      onUpdated(principal);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '계정 설정을 저장하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      aria-labelledby="admin-credentials-title"
      className="driver-invite-dialog customer-account-invite-dialog admin-credentials-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header className="driver-invite-header">
        <span>
          <strong id="admin-credentials-title">계정 설정</strong>
          <small>DSV 관제 운영 계정의 로그인 정보를 변경합니다.</small>
        </span>
        <button aria-label="계정 설정 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button>
      </header>
      <form className="customer-account-invite-form admin-credentials-form" id="admin-credentials-form" aria-label="DSV admin credential settings" onSubmit={(event) => void submit(event)}>
        <label>현재 비밀번호
          <input name="currentPassword" type="password" required autoComplete="current-password" disabled={submitting} />
        </label>
        <label>새 로그인 아이디
          <input name="newLoginId" autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" placeholder="변경할 때만 입력" disabled={submitting} />
        </label>
        <label>새 비밀번호
          <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} placeholder="변경할 때만 입력" disabled={submitting} />
        </label>
        <label>새 비밀번호 확인
          <input name="passwordConfirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} disabled={submitting} />
        </label>
      </form>
      <section className="customer-account-invite-preview" aria-label="계정 설정 안내">
        <strong>변경 전 확인</strong>
        <p>현재 비밀번호로 본인 확인을 한 뒤 로그인 아이디 또는 새 비밀번호 중 하나 이상을 변경합니다.</p>
        <dl>
          <div><dt>계정 범위</dt><dd>DSV 관제 운영 계정</dd></div>
          <div><dt>권한</dt><dd>현재 계정의 권한은 그대로 유지됩니다.</dd></div>
          <div><dt>세션</dt><dd>저장 후 현재 세션 정보가 새 응답으로 갱신됩니다.</dd></div>
        </dl>
        {error ? <p className="driver-invite-error" role="alert">{error}</p> : null}
      </section>
      <footer className="driver-invite-footer">
        <button type="button" onClick={onClose}>닫기</button>
        <button className="primary" disabled={submitting} form="admin-credentials-form" type="submit">{submitting ? '저장 중' : '저장'}</button>
      </footer>
    </dialog>
  );
}
