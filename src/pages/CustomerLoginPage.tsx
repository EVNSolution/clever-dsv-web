import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { customerDeliveryPath } from '../app-routes';
import { loginCustomerAccount } from '../services/customer-accounts';

export function CustomerLoginPage({ onLogin }: { onLogin: (path: typeof customerDeliveryPath) => void }): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setError('');
    try {
      await loginCustomerAccount({ id: String(form.get('id') ?? ''), password: String(form.get('password') ?? '') });
      formElement.reset();
      onLogin(customerDeliveryPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '고객 로그인 요청에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="customer-auth-title">
        <header className="auth-identity">
          <span className="auth-mark" aria-hidden="true">C</span>
          <span className="auth-brand"><strong>CLEVER DSV</strong><small>고객 배송 조회</small></span>
        </header>
        <div className="auth-heading">
          <h1 id="customer-auth-title">고객 로그인</h1>
          <p>초대로 활성화한 고객 계정으로 배송 조회 화면에 접속합니다.</p>
        </div>
        <form className="auth-form" aria-label="Customer login" onSubmit={submit}>
          <label className="auth-field" htmlFor="customer-auth-id">아이디</label>
          <div className="auth-control">
            <input id="customer-auth-id" aria-label="ID" name="id" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={80} required />
          </div>
          <label className="auth-field" htmlFor="customer-auth-password">비밀번호</label>
          <div className="auth-control">
            <input id="customer-auth-password" aria-label="Password" name="password" type="password" autoComplete="current-password" maxLength={256} required />
          </div>
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '로그인 중' : '로그인'}</button>
        </form>
      </section>
    </main>
  );
}
