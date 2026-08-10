import type { FormEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { defaultPath } from '../app-routes';
import type { AdminInvitationValidation } from '../services/auth';
import { completeAdminInvitation, validateAdminInvitation } from '../services/auth';

type SetupState =
  | { error: string; loading: false; token: string | null; validation: null }
  | { error: null; loading: true; token: string; validation: null }
  | { error: null; loading: false; token: string; validation: AdminInvitationValidation };

export function AdminAccountSetupPage({ onComplete }: { onComplete: (path: typeof defaultPath) => void }): ReactElement {
  const [state, setState] = useState<SetupState>(() => {
    const token = readTokenFromFragment();
    return token ? { error: null, loading: true, token, validation: null } : { error: '초대 토큰이 없습니다.', loading: false, token: null, validation: null };
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!state.token || state.validation || state.error) return;
    let active = true;
    const token = state.token;
    validateAdminInvitation(token)
      .then((validation) => {
        if (active) setState({ error: null, loading: false, token, validation });
      })
      .catch((cause) => {
        if (active) setState({ error: cause instanceof Error ? cause.message : '초대 확인에 실패했습니다.', loading: false, token: null, validation: null });
      });
    return () => { active = false; };
  }, [state.error, state.token, state.validation]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!state.token || !state.validation) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const loginId = String(form.get('loginId') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const passwordConfirm = String(form.get('passwordConfirm') ?? '');
    if (password !== passwordConfirm) {
      setSubmitError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      await completeAdminInvitation({ token: state.token, loginId, password });
      formElement.reset();
      onComplete(defaultPath);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : '계정 설정에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel customer-setup-panel" aria-labelledby="admin-setup-title">
        <header className="auth-identity">
          <span className="auth-mark" aria-hidden="true">C</span>
          <span className="auth-brand"><strong>CLEVER DSV</strong><small>관제 운영 계정 설정</small></span>
        </header>
        <div className="auth-heading">
          <h1 id="admin-setup-title">계정 설정</h1>
          <p>이메일 링크로 확인된 DSV 관제 운영 계정만 활성화합니다.</p>
        </div>
        {state.loading ? <p className="auth-status" role="status">초대 정보를 확인하는 중입니다.</p> : null}
        {state.error ? <p className="auth-error" role="alert">{state.error}</p> : null}
        {state.validation ? <form className="auth-form customer-setup-form" aria-label="DSV admin account setup" onSubmit={submit}>
          <dl className="auth-summary">
            <div><dt>계정 범위</dt><dd>DSV 관제 운영 계정</dd></div>
            <div><dt>표시 이름</dt><dd>{state.validation.displayName ?? 'DSV 관제 운영자'}</dd></div>
            <div><dt>이메일</dt><dd>{state.validation.email}</dd></div>
            <div><dt>만료</dt><dd>{state.validation.expiresAt}</dd></div>
          </dl>
          <label className="auth-field" htmlFor="admin-setup-login-id">로그인 아이디</label>
          <div className="auth-control">
            <input id="admin-setup-login-id" aria-label="Login ID" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={64} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}" required />
          </div>
          <label className="auth-field" htmlFor="admin-setup-password">새 비밀번호</label>
          <div className="auth-control">
            <input id="admin-setup-password" aria-label="Password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required />
          </div>
          <p className="auth-help">영문 대문자, 소문자, 숫자, 특수문자를 포함해 12자 이상 입력하세요.</p>
          <label className="auth-field" htmlFor="admin-setup-password-confirm">비밀번호 확인</label>
          <div className="auth-control">
            <input id="admin-setup-password-confirm" aria-label="Confirm password" name="passwordConfirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required />
          </div>
          {submitError ? <p className="auth-error" role="alert">{submitError}</p> : null}
          <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '설정 중' : '계정 설정 완료'}</button>
        </form> : null}
      </section>
    </main>
  );
}

function readTokenFromFragment(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const token = new URLSearchParams(hash).get('token')?.trim() ?? '';
  if (window.location.hash) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  return token || null;
}
