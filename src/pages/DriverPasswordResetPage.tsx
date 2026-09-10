import type { FormEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  completeDriverPasswordReset,
  DriverPasswordResetError,
  validateDriverPasswordReset,
} from '../services/driver-password-reset';

type PageState =
  | { status: 'checking' }
  | { status: 'ready'; expiresAt: string }
  | { status: 'invalid'; message: string }
  | { status: 'complete' };

const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const INVALID_LINK_MESSAGE = '링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 링크를 요청해 주세요.';

export function DriverPasswordResetPage(): ReactElement {
  const tokenRef = useRef<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordConfirmRef = useRef<HTMLInputElement>(null);
  const completeRequestRef = useRef<AbortController | null>(null);
  const [pageState, setPageState] = useState<PageState>({ status: 'checking' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const reloadForNewLink = () => {
      if (window.location.hash !== '') window.location.reload();
    };
    window.addEventListener('hashchange', reloadForNewLink);
    return () => window.removeEventListener('hashchange', reloadForNewLink);
  }, []);

  useEffect(() => {
    if (tokenRef.current === null) tokenRef.current = readAndRemoveToken();
    const token = tokenRef.current;
    if (token === null) {
      setPageState({ status: 'invalid', message: INVALID_LINK_MESSAGE });
      return clearSecrets;
    }
    const controller = new AbortController();
    let active = true;
    const releaseSecrets = () => {
      active = false;
      controller.abort();
      completeRequestRef.current?.abort();
      clearSecrets();
      setSubmitting(false);
      setError('');
      setPageState({ status: 'invalid', message: INVALID_LINK_MESSAGE });
    };
    window.addEventListener('pagehide', releaseSecrets);
    validateDriverPasswordReset(token, controller.signal)
      .then(({ expiresAt }) => {
        if (!active) return;
        if (Date.parse(expiresAt) <= Date.now()) {
          clearSecrets();
          setPageState({ status: 'invalid', message: INVALID_LINK_MESSAGE });
          return;
        }
        setPageState({ status: 'ready', expiresAt });
      })
      .catch((cause: unknown) => {
        if (!active || controller.signal.aborted) return;
        clearSecrets();
        setPageState({ status: 'invalid', message: messageFor(cause) });
      });
    return () => {
      active = false;
      controller.abort();
      completeRequestRef.current?.abort();
      window.removeEventListener('pagehide', releaseSecrets);
    };
  }, []);

  useEffect(() => {
    if (pageState.status !== 'ready') return;
    const remainingMs = Date.parse(pageState.expiresAt) - Date.now();
    if (remainingMs <= 0) {
      clearSecrets();
      setPageState({ status: 'invalid', message: INVALID_LINK_MESSAGE });
      return;
    }
    const timeout = window.setTimeout(() => {
      completeRequestRef.current?.abort();
      clearSecrets();
      setSubmitting(false);
      setError('');
      setPageState({ status: 'invalid', message: INVALID_LINK_MESSAGE });
    }, remainingMs);
    return () => window.clearTimeout(timeout);
  }, [pageState]);

  function clearSecrets(): void {
    tokenRef.current = null;
    if (passwordRef.current) passwordRef.current.value = '';
    if (passwordConfirmRef.current) passwordConfirmRef.current.value = '';
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const token = tokenRef.current;
    const password = passwordRef.current?.value ?? '';
    if (completeRequestRef.current !== null) return;
    if (token === null || pageState.status !== 'ready' || Date.parse(pageState.expiresAt) <= Date.now()) {
      clearSecrets();
      setPageState({ status: 'invalid', message: INVALID_LINK_MESSAGE });
      return;
    }
    const validationMessage = passwordMessage(password);
    if (validationMessage !== '') {
      setError(validationMessage);
      return;
    }
    if (password !== (passwordConfirmRef.current?.value ?? '')) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    const controller = new AbortController();
    completeRequestRef.current = controller;
    setSubmitting(true);
    setError('');
    try {
      await completeDriverPasswordReset(token, password, controller.signal);
      if (controller.signal.aborted || tokenRef.current !== token) return;
      clearSecrets();
      setPageState({ status: 'complete' });
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof DriverPasswordResetError && cause.status === 401) {
        clearSecrets();
        setPageState({ status: 'invalid', message: cause.message });
        return;
      }
      setError(messageFor(cause));
    } finally {
      if (completeRequestRef.current === controller) completeRequestRef.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="driver-reset-title">
        <header className="auth-identity">
          <span className="auth-mark" aria-hidden="true">C</span>
          <span className="auth-brand"><strong>CLEVER Driver</strong><small>배송원 계정</small></span>
        </header>
        <div className="auth-heading">
          <h1 id="driver-reset-title">비밀번호 초기화</h1>
          <p>{pageState.status === 'complete'
            ? '새 비밀번호가 설정되었습니다.'
            : '관리자가 발급한 일회용 링크로 새 비밀번호를 설정해 주세요.'}</p>
        </div>
        {pageState.status === 'checking' ? <p className="auth-status" role="status">초기화 링크를 확인하고 있습니다.</p> : null}
        {pageState.status === 'invalid' ? <p className="auth-error" role="alert">{pageState.message}</p> : null}
        {pageState.status === 'complete' ? (
          <p className="auth-status" role="status">CLEVER Driver 앱에서 새 비밀번호로 로그인해 주세요.</p>
        ) : null}
        {pageState.status === 'ready' ? (
          <form className="auth-form" aria-label="배송원 비밀번호 초기화" onSubmit={(event) => void submit(event)}>
            <p className="auth-help">12~128자로 영문 대문자, 소문자, 숫자, 특수문자를 모두 포함해 주세요.</p>
            <label className="auth-field" htmlFor="driver-reset-password">새 비밀번호</label>
            <div className="auth-control">
              <input ref={passwordRef} id="driver-reset-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={submitting} />
            </div>
            <label className="auth-field" htmlFor="driver-reset-password-confirm">새 비밀번호 확인</label>
            <div className="auth-control">
              <input ref={passwordConfirmRef} id="driver-reset-password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={submitting} />
            </div>
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? '설정 중' : '새 비밀번호 설정'}</button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function readAndRemoveToken(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const candidate = params.get('token') ?? '';
  if (window.location.hash !== '') {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }
  return RESET_TOKEN_PATTERN.test(candidate) ? candidate : null;
}

function passwordMessage(password: string): string {
  return password.length >= 12
    && password.length <= 128
    && /[a-z]/u.test(password)
    && /[A-Z]/u.test(password)
    && /\d/u.test(password)
    && /[^A-Za-z0-9]/u.test(password)
    ? ''
    : '비밀번호는 12~128자로 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다.';
}

function messageFor(cause: unknown): string {
  return cause instanceof Error ? cause.message : '비밀번호 초기화를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
