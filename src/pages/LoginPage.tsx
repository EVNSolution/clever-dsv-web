import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { login } from '../services/auth';

export function LoginPage({ onLogin }: { onLogin: () => void }): ReactElement {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      await login({ id: String(form.get('id') ?? ''), password: String(form.get('password') ?? '') });
      onLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인 요청에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" aria-label="Login" onSubmit={submit}>
        <p className="eyebrow">dsv.cleversystem.ai</p>
        <h1>CLEVER Login</h1>
        <label>ID<input name="id" autoComplete="username" /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" /></label>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        <button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Login'}</button>
      </form>
    </main>
  );
}
