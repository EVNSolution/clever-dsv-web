const referenceNotes = [
  'DSV 전용 프론트 정본입니다.',
  '기존 HTML 데모는 docs/reference/demo-reference에 골든뷰로 보존합니다.',
  'route-ops-web, Shopify, Woo/Sync 화면과 분리합니다.',
];

export function App() {
  return (
    <main className="dsv-shell">
      <section className="title-card" aria-labelledby="page-title">
        <p className="eyebrow">dsv.cleversystem.ai</p>
        <h1 id="page-title">Clever - DSV</h1>
        <p>DSV 전용 웹 프론트엔드 준비 화면</p>
      </section>
      <section className="panel" aria-labelledby="ready-title">
        <h2 id="ready-title">작업 준비 완료 기준</h2>
        <ul>
          {referenceNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
