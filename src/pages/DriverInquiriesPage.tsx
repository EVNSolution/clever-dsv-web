import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { loadDriverInquiries, loadDriverInquiry } from '../services/driver-inquiries';
import type { DriverInquiry } from '../services/driver-inquiries';

const receivedAt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function DriverInquiriesPage() {
  const [items, setItems] = useState<DriverInquiry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [denied, setDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DriverInquiry | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const returnListFocus = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError('');
    void loadDriverInquiries(cursor, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setItems((current) => cursor === null ? page.items : [...current, ...page.items.filter((item) => !current.some((old) => old.id === item.id))]);
      setNextCursor(page.nextCursor);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 403) {
        setDenied(true);
        setItems([]);
        setDetail(null);
        setSelectedId(null);
      } else setListError('문의를 불러오지 못했습니다. 다시 시도해 주세요.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, revision]);

  useEffect(() => {
    setDetail(null);
    setDetailError('');
    if (selectedId === null) {
      if (returnListFocus.current) {
        listHeading.current?.focus();
        returnListFocus.current = false;
      }
      return;
    }
    const controller = new AbortController();
    detailHeading.current?.focus();
    void loadDriverInquiry(selectedId, controller.signal).then((inquiry) => {
      if (!controller.signal.aborted) setDetail(inquiry);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 403) {
        setDenied(true);
        setItems([]);
        setDetail(null);
      } else setDetailError(error instanceof ApiError && error.status === 404
        ? '문의를 찾을 수 없습니다. 삭제되었거나 조회할 수 없는 문의입니다.'
        : '문의 상세를 불러오지 못했습니다. 다시 시도해 주세요.');
    });
    return () => controller.abort();
  }, [selectedId, detailRevision]);

  const refresh = () => {
    setItems([]);
    setNextCursor(null);
    setSelectedId(null);
    setCursor(null);
    setRevision((value) => value + 1);
  };
  const closeDetail = () => {
    returnListFocus.current = true;
    setSelectedId(null);
  };

  if (denied) return <p role="alert">문의 조회 권한이 없습니다. 계정 권한을 확인해 주세요.</p>;

  return <div className={`inquiry-layout${selectedId !== null ? ' has-selection' : ''}`}>
    <section className="page-panel inquiry-list" aria-label="문의 목록" aria-busy={loading}>
      <div className="inquiry-section-heading">
        <h3 ref={listHeading} tabIndex={-1}>문의 목록</h3>
        <button className="btn" type="button" disabled={loading} onClick={refresh}>새로고침</button>
      </div>
      <p className="inquiry-note">최신순 · 접수일시 한국시간</p>
      {loading ? <p role="status">문의를 불러오는 중입니다.</p> : null}
      {listError ? <p role="alert">{listError} <button className="text-button" type="button" onClick={() => setRevision((value) => value + 1)}>다시 시도</button></p> : null}
      {!loading && !listError && items.length === 0 ? <p role="status">접수된 문의가 없습니다.</p> : null}
      <ul className="inquiry-items overlay-scroll">
        {items.map((item) => <li key={item.id}>
          <button className={`inquiry-item${item.id === selectedId ? ' active' : ''}`} type="button" aria-pressed={item.id === selectedId} aria-label={item.title} onClick={() => setSelectedId(item.id)}>
            <strong>{item.title}</strong>
            <span className="inquiry-meta"><span>{item.authorName}</span><time dateTime={item.createdAt}>{receivedAt.format(new Date(item.createdAt))}</time></span>
          </button>
        </li>)}
      </ul>
      {nextCursor !== null && !listError ? <button className="btn inquiry-more" type="button" disabled={loading} onClick={() => setCursor(nextCursor)}>더 보기</button> : null}
    </section>
    <section className="page-panel inquiry-detail" aria-label="문의 상세">
      <div className="inquiry-section-heading">
        <h3 ref={detailHeading} tabIndex={-1}>문의 상세</h3>
        {selectedId !== null ? <button className="btn" type="button" onClick={closeDetail}>목록으로</button> : null}
      </div>
      {selectedId === null ? <p role="status">목록에서 문의를 선택해 주세요.</p> : <>
        {detailError ? <p role="alert">{detailError} <button className="text-button" type="button" onClick={() => setDetailRevision((value) => value + 1)}>다시 시도</button></p>
          : detail?.id === selectedId ? <article className="inquiry-message overlay-scroll">
            <h4>{detail.title}</h4>
            <dl className="inquiry-author"><div><dt>작성자</dt><dd>{detail.authorName}</dd></div><div><dt>접수일시 (한국시간)</dt><dd><time dateTime={detail.createdAt}>{receivedAt.format(new Date(detail.createdAt))}</time></dd></div></dl>
            <p className="inquiry-body">{detail.body}</p>
          </article> : <p role="status">문의 상세를 불러오는 중입니다.</p>}
      </>}
    </section>
  </div>;
}
