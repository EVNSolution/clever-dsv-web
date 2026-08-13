import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import type { Principal } from '../services/auth';
import { updateCredentials } from '../services/auth';

export function PasswordChangePage({ onLogout, onUpdated }: { onLogout: () => void; onUpdated: (principal: Principal) => void }): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('passwordConfirm') ?? '')) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      onUpdated(await updateCredentials({
        currentPassword: String(form.get('currentPassword') ?? ''),
        password,
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="password-change-title">
        <header className="auth-identity">
          <span className="auth-mark" aria-hidden="true">C</span>
          <span className="auth-brand"><strong>CLEVER DSV</strong><small>배송 운영 시스템</small></span>
        </header>
        <div className="auth-heading">
          <h1 id="password-change-title">비밀번호 변경</h1>
          <p>현재 비밀번호를 확인한 뒤 새 비밀번호를 설정해 주세요.</p>
        </div>
        <form className="auth-form" aria-label="비밀번호 변경" onSubmit={(event) => void submit(event)}>
          <label className="auth-field" htmlFor="current-password">현재 비밀번호</label>
          <div className="auth-control">
            <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required disabled={submitting} />
          </div>
          <label className="auth-field" htmlFor="new-password">새 비밀번호</label>
          <div className="auth-control">
            <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={submitting} />
          </div>
          <label className="auth-field" htmlFor="new-password-confirm">새 비밀번호 확인</label>
          <div className="auth-control">
            <input id="new-password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required disabled={submitting} />
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '변경 중' : '비밀번호 변경'}</button>
          <button className="auth-alt-link" type="button" onClick={onLogout}>로그아웃</button>
        </form>
      </section>
    </main>
  );
}
