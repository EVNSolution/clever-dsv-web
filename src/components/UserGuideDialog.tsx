import type { FormEvent, ReactElement, TouchEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  EventBus,
  FindState,
  LinkTarget,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  ScrollMode,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import '../styles/features/user-guide.css';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const guideUrl = '/api/dsv/guides/operator';
const guideDownloadUrl = `${guideUrl}?download=1`;

type LoadState = 'error' | 'loading' | 'ready';
type ViewMode = 'continuous' | 'page';
type OutlineItem = {
  dest: string | unknown[] | null;
  items: OutlineItem[];
  title: string;
};

export function UserGuideDialog({ onClose }: { onClose: () => void }): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | undefined>(undefined);
  const linkServiceRef = useRef<PDFLinkService | undefined>(undefined);
  const eventBusRef = useRef<EventBus | undefined>(undefined);
  const lastSearchRef = useRef('');
  const touchStartRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineOpen, setOutlineOpen] = useState(() => !window.matchMedia('(max-width: 1024px)').matches);
  const [viewMode, setViewMode] = useState<ViewMode>('continuous');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const container = containerRef.current;
    const viewerElement = viewerElementRef.current;
    if (!dialog || !container || !viewerElement) return undefined;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();

    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus, externalLinkTarget: LinkTarget.BLANK, ignoreDestinationZoom: true });
    const findController = new PDFFindController({ eventBus, linkService });
    const viewer = new PDFViewer({
      container,
      eventBus,
      findController,
      linkService,
      removePageBorders: true,
      supportsPinchToZoom: true,
      viewer: viewerElement,
    });
    eventBusRef.current = eventBus;
    linkServiceRef.current = linkService;
    viewerRef.current = viewer;
    linkService.setViewer(viewer);

    const onPagesInit = () => {
      viewer.currentScaleValue = 'page-width';
      viewer.scrollMode = ScrollMode.VERTICAL;
      setZoom(Math.round(viewer.currentScale * 100));
      setLoadState('ready');
    };
    const onPageChanging = ({ pageNumber }: { pageNumber: number }) => {
      setCurrentPage(pageNumber);
      setPageInput(String(pageNumber));
    };
    const onScaleChanging = ({ scale }: { scale: number }) => setZoom(Math.round(scale * 100));
    const onFindState = ({ matchesCount, state }: { matchesCount?: { current: number; total: number }; state: number }) => {
      if (state === FindState.PENDING) setSearchResult('검색 중');
      else if (state === FindState.NOT_FOUND) setSearchResult('검색 결과 없음');
      else if (matchesCount?.total) setSearchResult(`${matchesCount.current} / ${matchesCount.total}`);
      else setSearchResult('');
    };
    const onFindMatchesCount = ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
      setSearchResult(matchesCount.total ? `${matchesCount.current} / ${matchesCount.total}` : '검색 결과 없음');
    };
    eventBus.on('pagesinit', onPagesInit);
    eventBus.on('pagechanging', onPageChanging);
    eventBus.on('scalechanging', onScaleChanging);
    eventBus.on('updatefindcontrolstate', onFindState);
    eventBus.on('updatefindmatchescount', onFindMatchesCount);

    const loadingTask = getDocument({ url: guideUrl, withCredentials: true });
    void loadingTask.promise.then(async (pdfDocument) => {
      setPageCount(pdfDocument.numPages);
      linkService.setDocument(pdfDocument);
      findController.setDocument(pdfDocument);
      viewer.setDocument(pdfDocument);
      setOutline((await pdfDocument.getOutline() ?? []) as OutlineItem[]);
    }).catch(() => {
      setLoadError('사용자 가이드를 불러오지 못했습니다. 로그인 상태를 확인한 뒤 다시 시도해 주세요.');
      setLoadState('error');
    });

    return () => {
      eventBus.off('pagesinit', onPagesInit);
      eventBus.off('pagechanging', onPageChanging);
      eventBus.off('scalechanging', onScaleChanging);
      eventBus.off('updatefindcontrolstate', onFindState);
      eventBus.off('updatefindmatchescount', onFindMatchesCount);
      void loadingTask.destroy();
      if (dialog.open) dialog.close();
    };
  }, []);

  const setPage = (page: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = Math.min(Math.max(page, 1), pageCount || 1);
    viewer.currentPageNumber = next;
  };

  const submitPage = (event: FormEvent) => {
    event.preventDefault();
    const page = Number(pageInput);
    if (Number.isInteger(page)) setPage(page);
    else setPageInput(String(currentPage));
  };

  const changeMode = (mode: ViewMode) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const page = viewer.currentPageNumber;
    viewer.scrollMode = mode === 'continuous' ? ScrollMode.VERTICAL : ScrollMode.PAGE;
    viewer.currentPageNumber = page;
    viewer.currentScaleValue = 'page-width';
    setViewMode(mode);
  };

  const find = (findPrevious = false) => {
    const query = searchQuery.trim();
    const eventBus = eventBusRef.current;
    if (!eventBus) return;
    if (!query) {
      eventBus.dispatch('findbarclose', { source: dialogRef.current });
      lastSearchRef.current = '';
      setSearchResult('');
      return;
    }
    eventBus.dispatch('find', {
      caseSensitive: false,
      entireWord: false,
      findPrevious,
      highlightAll: true,
      matchDiacritics: false,
      phraseSearch: true,
      query,
      source: dialogRef.current,
      type: lastSearchRef.current === query ? 'again' : '',
    });
    lastSearchRef.current = query;
  };

  const navigateOutline = (destination: OutlineItem['dest']) => {
    if (destination !== null) void linkServiceRef.current?.goToDestination(destination as string | unknown[]);
    if (window.matchMedia('(max-width: 1024px)').matches) setOutlineOpen(false);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    touchStartRef.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = undefined;
    if (viewMode !== 'page' || !start || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    setPage(currentPage + (dx < 0 ? 1 : -1));
  };

  return (
    <dialog
      aria-labelledby="user-guide-title"
      className="user-guide-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      ref={dialogRef}
    >
      <header className="user-guide-header">
        <div>
          <span className="user-guide-title-icon"><FileText aria-hidden="true" /></span>
          <span>
            <h2 id="user-guide-title" ref={titleRef} tabIndex={-1}>CLEVER DSV 사용자 가이드</h2>
            <small>관제 운영자 가이드 · 2026. 8. 11.</small>
          </span>
        </div>
        <nav aria-label="사용자 가이드 파일 작업">
          <a href={guideUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /><span>새 창</span></a>
          <a href={guideDownloadUrl}><Download aria-hidden="true" /><span>다운로드</span></a>
          <button aria-label="사용자 가이드 닫기" type="button" onClick={onClose}><X aria-hidden="true" /></button>
        </nav>
      </header>

      <div className="user-guide-toolbar" aria-label="사용자 가이드 도구">
        <button aria-label="목차" className="user-guide-outline-toggle" type="button" aria-expanded={outlineOpen} onClick={() => setOutlineOpen((open) => !open)}>
          {outlineOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}<span>목차</span>
        </button>
        <form className="user-guide-search" role="search" onSubmit={(event) => { event.preventDefault(); find(false); }}>
          <Search aria-hidden="true" />
          <input aria-label="가이드 검색" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="가이드 검색" />
          <span aria-live="polite">{searchResult}</span>
          <button type="submit" aria-label="다음 검색 결과"><ChevronDown aria-hidden="true" /></button>
          <button type="button" aria-label="이전 검색 결과" onClick={() => find(true)}><ChevronUp aria-hidden="true" /></button>
        </form>
        <div className="user-guide-page-controls">
          <button type="button" aria-label="이전 페이지" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></button>
          <form onSubmit={submitPage}>
            <input aria-label="현재 페이지" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value)} />
            <span>/ {pageCount || '-'}</span>
          </form>
          <button type="button" aria-label="다음 페이지" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="user-guide-zoom-controls">
          <button type="button" aria-label="축소" onClick={() => viewerRef.current?.decreaseScale()}><Minus aria-hidden="true" /></button>
          <button type="button" className="user-guide-zoom-value" onClick={() => { if (viewerRef.current) viewerRef.current.currentScaleValue = 'page-width'; }}>{zoom}%</button>
          <button type="button" aria-label="확대" onClick={() => viewerRef.current?.increaseScale()}><Plus aria-hidden="true" /></button>
        </div>
        <div className="user-guide-view-mode" role="group" aria-label="페이지 보기 방식">
          <button type="button" className={viewMode === 'continuous' ? 'active' : ''} aria-pressed={viewMode === 'continuous'} onClick={() => changeMode('continuous')}>연속 스크롤</button>
          <button type="button" className={viewMode === 'page' ? 'active' : ''} aria-pressed={viewMode === 'page'} onClick={() => changeMode('page')}>페이지</button>
        </div>
      </div>

      <div className={`user-guide-workspace${outlineOpen ? ' outline-open' : ''}`}>
        <aside className="user-guide-outline" aria-label="사용자 가이드 목차">
          <div><BookOpen aria-hidden="true" /><strong>목차</strong><small>{pageCount ? `${pageCount}페이지` : ''}</small></div>
          {outline.length ? <OutlineTree items={outline} onNavigate={navigateOutline} /> : <p>{loadState === 'loading' ? '목차를 불러오는 중입니다.' : '목차가 없습니다.'}</p>}
        </aside>
        <button className="user-guide-outline-backdrop" type="button" aria-label="목차 닫기" onClick={() => setOutlineOpen(false)} />
        <div className="user-guide-viewer-shell">
          <div
            className="user-guide-viewer-container"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            ref={containerRef}
            role="main"
            tabIndex={0}
          >
            <div className="pdfViewer user-guide-pdf-viewer" ref={viewerElementRef} />
            {loadState === 'loading' ? <div className="user-guide-state" role="status">사용자 가이드를 불러오는 중입니다.</div> : null}
            {loadState === 'error' ? <div className="user-guide-state error" role="alert"><strong>가이드를 열 수 없습니다.</strong><span>{loadError}</span></div> : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function OutlineTree({ items, onNavigate, path = '' }: { items: OutlineItem[]; onNavigate: (destination: OutlineItem['dest']) => void; path?: string }): ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  return (
    <ol>
      {items.map((item, index) => {
        const key = `${path}${index}`;
        const hasChildren = item.items.length > 0;
        const isCollapsed = collapsed.has(key);
        return (
          <li key={`${key}-${item.title}`}>
            <span>
              <button type="button" className="user-guide-outline-link" disabled={item.dest === null} onClick={() => onNavigate(item.dest)}>{item.title}</button>
              {hasChildren ? <button type="button" className="user-guide-outline-expand" aria-label={`${item.title} 하위 목차 ${isCollapsed ? '펼치기' : '접기'}`} aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}>{isCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}</button> : null}
            </span>
            {hasChildren && !isCollapsed ? <OutlineTree items={item.items} onNavigate={onNavigate} path={`${key}.`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}
