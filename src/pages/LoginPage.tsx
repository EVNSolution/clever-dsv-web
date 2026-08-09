import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { customerLoginPath } from '../app-routes';
import { login } from '../services/auth';

export function LoginPage({ onLogin }: { onLogin: () => void }): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setError('');
    try {
      await login({ id: String(form.get('id') ?? ''), password: String(form.get('password') ?? '') });
      formElement.reset();
      onLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인 요청에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <header className="auth-identity">
          <span className="auth-mark" aria-hidden="true">C</span>
          <span className="auth-brand"><strong>CLEVER DSV</strong><small>배송 운영 시스템</small></span>
        </header>
        <div className="auth-heading">
          <h1 id="auth-title">로그인</h1>
          <p>관리자 계정으로 배송 운영 화면에 접속합니다.</p>
        </div>
        <a className="auth-alt-link" href={customerLoginPath}>고객 배송조회 로그인</a>
        <form className="auth-form" aria-label="Login" onSubmit={submit}>
          <label className="auth-field" htmlFor="auth-id">아이디</label>
          <div className="auth-control">
            <input id="auth-id" aria-label="ID" name="id" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
          </div>
          <label className="auth-field" htmlFor="auth-password">비밀번호</label>
          <div className="auth-control">
            <input id="auth-password" aria-label="Password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '로그인 중' : '로그인'}</button>
        </form>
      </section>
    </main>
  );
}
