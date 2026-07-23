import type { FormEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { customerDeliveryPath } from '../app-routes';
import { apiConfig } from '../api/config';
import type { ManagementData } from '../demo/management';
import { addressSimilarity, loadManagementData, managementId } from '../demo/management';
import { getCustomerOrders } from '../demo/selectors/customer';
import { emptyManagementData, loadManagementSnapshot, persistManagementChange } from '../services/management';
import { ResourcesPage } from './ResourcesPage';

type MasterScope = 'resources' | 'network' | 'conditions';
type NetworkEditor = { kind: 'customer' | 'destination'; id?: string } | null;

const scopes: Array<{ id: MasterScope; label: string }> = [
  { id: 'resources', label: '운송자원' },
  { id: 'network', label: '고객사' },
  { id: 'conditions', label: '운송조건' },
];

export function MasterDataPage(): ReactElement {
  const [scope, setScope] = useState<MasterScope>('resources');
  const [data, setData] = useState(() => apiConfig.mode === 'remote' ? emptyManagementData : loadManagementData());
  const [loadState, setLoadState] = useState<{ error: string | null; loading: boolean }>({ error: null, loading: apiConfig.mode === 'remote' });
  const shouldShowRemoteState = apiConfig.mode === 'remote' && (loadState.loading || loadState.error);
  const loadRemoteData = () => {
    setLoadState({ error: null, loading: true });
    loadManagementSnapshot()
      .then((snapshot) => {
        setData(snapshot);
        setLoadState({ error: null, loading: false });
      })
      .catch((error) => {
        if (apiConfig.mode === 'remote') setData(emptyManagementData);
        setLoadState({ error: errorMessage(error), loading: false });
      });
  };
  useEffect(() => {
    let active = true;
    setLoadState({ error: null, loading: true });
    loadManagementSnapshot()
      .then((snapshot) => { if (active) { setData(snapshot); setLoadState({ error: null, loading: false }); } })
      .catch((error) => { if (active) setLoadState({ error: errorMessage(error), loading: false }); });
    return () => { active = false; };
  }, []);
  const updateData = async (next: ManagementData): Promise<void> => {
    if (apiConfig.mode === 'remote') {
      try {
        setData(await persistManagementChange(data, next));
      } catch (error) {
        window.alert(errorMessage(error));
        throw error;
      }
      return;
    }
    const latest = loadManagementData();
    const merged: ManagementData = {
      drivers: next.drivers === data.drivers ? latest.drivers : next.drivers,
      vehicles: next.vehicles === data.vehicles ? latest.vehicles : next.vehicles,
      assignments: next.assignments === data.assignments ? latest.assignments : next.assignments,
      customers: next.customers === data.customers ? latest.customers : next.customers,
      destinations: next.destinations === data.destinations ? latest.destinations : next.destinations,
      conditions: next.conditions === data.conditions ? latest.conditions : next.conditions,
    };
    setData(merged);
    try {
      setData(await persistManagementChange(data, merged));
    } catch (error) {
      setData(data);
      window.alert(errorMessage(error));
      throw error;
    }
  };

  let content: ReactElement | null = null;
  if (!shouldShowRemoteState) {
    switch (scope) {
      case 'resources':
        content = <ResourcesPage data={data} onChange={updateData} />;
        break;
      case 'network':
        content = <NetworkMaster data={data} onChange={updateData} />;
        break;
      case 'conditions':
        content = <ConditionMaster data={data} onChange={updateData} />;
        break;
    }
  }

  return (
    <div className="master-data-shell">
      <nav className="master-scope-nav" aria-label="기준정보 범주">
        {scopes.map((item) => <button key={item.id} type="button" aria-pressed={scope === item.id} onClick={() => setScope(item.id)}>{item.label}</button>)}
      </nav>
      {apiConfig.mode === 'remote' && loadState.loading ? <div className="management-empty" role="status">기준정보를 불러오는 중입니다.</div> : null}
      {apiConfig.mode === 'remote' && loadState.error ? <div className="management-empty" role="alert"><span>{loadState.error}</span><span className="management-actions"><button type="button" onClick={loadRemoteData}>다시 시도</button></span></div> : null}
      {content}
    </div>
  );
}

function NetworkMaster({ data, onChange }: { data: ManagementData; onChange: (data: ManagementData) => Promise<void> }): ReactElement {
  const isRemote = apiConfig.mode === 'remote';
  const [selectedCustomerId, setSelectedCustomerId] = useState(data.customers[0]?.id ?? '');
  const customer = data.customers.find((item) => item.id === selectedCustomerId) ?? data.customers[0];
  const destinations = isRemote ? data.destinations : data.destinations.filter((item) => item.customerId === customer?.id);
  const [selectedDestinationId, setSelectedDestinationId] = useState(destinations[0]?.id ?? '');
  const selected = destinations.find((item) => item.id === selectedDestinationId) ?? destinations[0];
  const [editor, setEditor] = useState<NetworkEditor>(null);
  const [addressDraft, setAddressDraft] = useState('');
  const customerOrders = !isRemote && customer ? getCustomerOrders(customer.id) : [];
  const similarDestinations = !isRemote && addressDraft ? data.destinations
    .filter((item) => item.id !== editor?.id)
    .map((item) => ({ item, score: addressSimilarity(addressDraft, item.address) }))
    .filter(({ score }) => score >= 0.6)
    .sort((left, right) => right.score - left.score) : [];

  const selectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setSelectedDestinationId(isRemote ? (data.destinations[0]?.id ?? '') : (data.destinations.find((item) => item.customerId === customerId)?.id ?? ''));
    setEditor(null);
  };
  const openDestinationEditor = (id?: string) => {
    setAddressDraft(data.destinations.find((item) => item.id === id)?.address ?? '');
    setEditor({ kind: 'destination', id });
  };
  const removeCustomer = () => {
    if (!customer || !window.confirm(`${customer.name} 고객사를 영구 삭제합니다.`)) return;
    const customers = data.customers.filter((item) => item.id !== customer.id);
    const removedDestinationIds = new Set(data.destinations.filter((item) => item.customerId === customer.id).map((item) => item.id));
    const remainingDestinations = data.destinations.filter((item) => item.customerId !== customer.id).map((item) => item.sameAsId && removedDestinationIds.has(item.sameAsId) ? { ...item, sameAsId: undefined } : item);
    void onChange({ ...data, customers, destinations: remainingDestinations }).catch(() => undefined);
    setSelectedCustomerId(customers[0]?.id ?? ''); setSelectedDestinationId(''); setEditor(null);
  };
  const removeDestination = () => {
    if (!selected || !window.confirm(`${selected.name} 배송지를 영구 삭제합니다.`)) return;
    const next = destinations.filter((item) => item.id !== selected.id);
    void onChange({ ...data, destinations: data.destinations.filter((item) => item.id !== selected.id).map((item) => item.sameAsId === selected.id ? { ...item, sameAsId: undefined } : item) }).catch(() => undefined);
    setSelectedDestinationId(next[0]?.id ?? ''); setEditor(null);
  };

  return (
    <div className="page-grid master-network-grid">
      <section className="page-panel">
        <div className="tab-line section-heading"><span>고객사</span>{isRemote ? <span className="section-meta">원격 읽기 전용</span> : <CrudActions name="고객사" selected={!!customer} onCreate={() => setEditor({ kind: 'customer' })} onEdit={() => setEditor({ kind: 'customer', id: customer?.id })} onDelete={removeCustomer} />}</div>
        <div className="record-scroll overlay-scroll"><table className="page-table master-customer-table"><thead><tr><th>고객사</th><th>고객 코드</th><th>Order</th><th>배송조회</th></tr></thead><tbody>
          {data.customers.map((item) => {
            const orders = isRemote ? [] : getCustomerOrders(item.id);
            return <tr className={item.id === customer?.id ? 'active' : ''} key={item.id} tabIndex={0} onClick={() => selectCustomer(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectCustomer(item.id); }}><td><strong>{item.name}</strong></td><td>{item.billingCode || unavailable(isRemote)}</td><td>{orders.length}건</td><td>{orders.length ? <a className="master-customer-link" href={`${customerDeliveryPath}?customer=${encodeURIComponent(item.id)}`} aria-label={`${item.name} 배송조회`} onClick={(event) => event.stopPropagation()}>배송조회</a> : '-'}</td></tr>;
          })}
        </tbody></table>{!data.customers.length ? <EmptyState label="고객사를 등록하세요." /> : null}</div>
      </section>
      <section className="page-panel master-destination-panel">
        <div className="tab-line section-heading"><span>배송지</span>{isRemote ? <span className="section-meta">고객사 연결 미제공</span> : <CrudActions name="배송지" selected={!!selected} onCreate={() => openDestinationEditor()} onEdit={() => openDestinationEditor(selected?.id)} onDelete={removeDestination} />}</div>
        <div className="record-scroll overlay-scroll"><table className="page-table master-destination-table"><thead><tr><th>배송지</th><th>주소</th><th>동일 주소</th></tr></thead><tbody>
          {destinations.map((item) => <tr className={item.id === selected?.id ? 'active' : ''} key={item.id} tabIndex={0} onClick={() => { setSelectedDestinationId(item.id); setEditor(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedDestinationId(item.id); }}><td>{item.name}</td><td>{item.address || unavailable(isRemote)}</td><td>{item.sameAsId ? '연결' : '-'}</td></tr>)}
        </tbody></table>{customer && !destinations.length ? <EmptyState label="배송지를 등록하세요." /> : null}</div>
      </section>
      <section className="page-panel wide master-editor-panel">
        {editor?.kind === 'customer' ? <CustomerForm customer={data.customers.find((item) => item.id === editor.id)} onCancel={() => setEditor(null)} onSave={async (saved) => {
          const customers = editor.id ? data.customers.map((item) => item.id === editor.id ? saved : item) : [...data.customers, saved];
          await onChange({ ...data, customers }); setSelectedCustomerId(saved.id); setSelectedDestinationId(data.destinations.find((item) => item.customerId === saved.id)?.id ?? ''); setEditor(null);
        }} /> : editor?.kind === 'destination' ? <DestinationForm customerId={customer?.id ?? ''} destination={data.destinations.find((item) => item.id === editor.id)} destinations={data.destinations} address={addressDraft} similar={similarDestinations} onAddressChange={setAddressDraft} onCancel={() => setEditor(null)} onSave={async (saved) => {
          const allDestinations = editor.id ? data.destinations.map((item) => item.id === editor.id ? saved : item) : [...data.destinations, saved];
          await onChange({ ...data, destinations: allDestinations }); setSelectedDestinationId(saved.id); setEditor(null);
        }} /> : customer ? <>
          <div className="tab-line section-heading"><span>고객사 상세</span><span className="section-meta">{customerOrders.length}건 Order</span></div>
          <div className="master-detail-grid"><dl><dt>고객사</dt><dd>{customer.name}</dd><dt>고객 코드</dt><dd>{customer.billingCode || unavailable(isRemote)}</dd><dt>선택 배송지</dt><dd>{selected?.name ?? '-'}</dd><dt>정규화 주소</dt><dd>{selected?.address || unavailable(isRemote)}</dd></dl><div><strong>동일 배송지 연결</strong><p>{isRemote ? '미제공' : selected?.sameAsId ? data.destinations.find((item) => item.id === selected.sameAsId)?.name ?? '연결된 배송지' : '연결 없음'}</p></div></div>
        </> : <EmptyState label="고객사를 등록하세요." />}
      </section>
    </div>
  );
}

function ConditionMaster({ data, onChange }: { data: ManagementData; onChange: (data: ManagementData) => Promise<void> }): ReactElement {
  const isRemote = apiConfig.mode === 'remote';
  const [selectedId, setSelectedId] = useState(data.conditions[0]?.id ?? '');
  const selected = data.conditions.find((item) => item.id === selectedId) ?? data.conditions[0];
  const [editorId, setEditorId] = useState<string | null>();
  return <div className="page-grid master-condition-grid">
    <section className="page-panel wide"><div className="tab-line section-heading"><span>운송조건</span><span className="management-actions"><button type="button" aria-label="운송조건 등록" onClick={() => setEditorId(null)}>등록</button><button type="button" aria-label="운송조건 수정" disabled={!selected || isRemote} onClick={() => setEditorId(selected?.id)}>수정</button></span></div><table className="page-table"><thead><tr><th>코드</th><th>명칭</th><th>설명</th></tr></thead><tbody>{data.conditions.map((condition) => <tr className={condition.id === selected?.id ? 'active' : ''} key={condition.id} tabIndex={0} onClick={() => { setSelectedId(condition.id); setEditorId(undefined); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(condition.id); setEditorId(undefined); } }}><td>{condition.code || unavailable(isRemote)}</td><td>{condition.name}</td><td>{condition.description || unavailable(isRemote)}</td></tr>)}</tbody></table></section>
    <section className="page-panel wide">{editorId !== undefined ? <ConditionForm condition={data.conditions.find((item) => item.id === editorId)} onCancel={() => setEditorId(undefined)} onSave={async (saved) => { if (data.conditions.some((item) => item.id !== saved.id && item.code === saved.code)) { window.alert('같은 조건 코드가 이미 등록되어 있습니다.'); return; } const conditions = editorId ? data.conditions.map((item) => item.id === editorId ? saved : item) : [...data.conditions, saved]; await onChange({ ...data, conditions }); setSelectedId(saved.id); setEditorId(undefined); }} /> : selected ? <><div className="tab-line section-heading"><span>조건 상세</span><span className="section-meta">{selected.code || unavailable(isRemote)}</span></div><div className="master-detail-grid"><dl><dt>표시 명칭</dt><dd>{selected.name}</dd><dt>설명</dt><dd>{selected.description || unavailable(isRemote)}</dd></dl><dl><dt>온도 범위</dt><dd>{selected.temperature || unavailable(isRemote)}</dd><dt>적합 차량</dt><dd>{selected.vehicle || unavailable(isRemote)}</dd><dt>필수 증빙</dt><dd>{selected.proof || unavailable(isRemote)}</dd></dl></div></> : <EmptyState label="운송조건을 등록하세요." />}</section>
  </div>;
}

function CustomerForm({ customer, onSave, onCancel }: { customer?: ManagementData['customers'][number]; onSave: (customer: ManagementData['customers'][number]) => void | Promise<void>; onCancel: () => void }): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        id: customer?.id ?? managementId('customer'),
        name: text(form, 'name'),
        billingCode: text(form, 'billingCode'),
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="고객사 편집" onSubmit={submit}><EditorTitle title={customer ? '고객사 수정' : '고객사 등록'} /><div className="management-form-grid"><label>고객사명<input name="name" required defaultValue={customer?.name} /></label><label>고객 코드<input name="billingCode" required defaultValue={customer?.billingCode} /></label></div><FormActions onCancel={onCancel} /></form>;
}

function DestinationForm({ customerId, destination, destinations, address, similar, onAddressChange, onSave, onCancel }: {
  customerId: string;
  destination?: ManagementData['destinations'][number];
  destinations: ManagementData['destinations'];
  address: string;
  similar: Array<{ item: ManagementData['destinations'][number]; score: number }>;
  onAddressChange: (address: string) => void;
  onSave: (destination: ManagementData['destinations'][number]) => void | Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sameAsId = text(form, 'sameAsId');
    try {
      await onSave({
        id: destination?.id ?? managementId('destination'),
        customerId,
        name: text(form, 'name'),
        address: text(form, 'address'),
        ...(sameAsId ? { sameAsId } : {}),
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="배송지 편집" onSubmit={submit}><EditorTitle title={destination ? '배송지 수정' : '배송지 등록'} /><div className="management-form-grid"><label>배송지명<input name="name" required defaultValue={destination?.name} /></label><label className="wide">주소<input name="address" required value={address} onChange={(event) => onAddressChange(event.target.value)} /></label><label className="wide">동일 배송지<select name="sameAsId" defaultValue={destination?.sameAsId ?? ''}><option value="">연결하지 않음</option>{destinations.filter((item) => item.id !== destination?.id).map((item) => <option key={item.id} value={item.id}>{item.name} — {item.address}</option>)}</select></label></div>{similar.length ? <div className="address-similarity" role="status"><strong>유사 주소 후보</strong>{similar.slice(0, 3).map(({ item, score }) => <span key={item.id}>{item.name} {Math.round(score * 100)}%</span>)}</div> : null}<FormActions onCancel={onCancel} /></form>;
}

function ConditionForm({ condition, onSave, onCancel }: { condition?: ManagementData['conditions'][number]; onSave: (condition: ManagementData['conditions'][number]) => void | Promise<void>; onCancel: () => void }): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        id: condition?.id ?? managementId('condition'),
        code: text(form, 'code'),
        name: text(form, 'name'),
        description: text(form, 'description'),
        temperature: text(form, 'temperature'),
        vehicle: text(form, 'vehicle'),
        proof: text(form, 'proof'),
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="운송조건 편집" onSubmit={submit}><EditorTitle title={condition ? '운송조건 수정' : '운송조건 등록'} /><div className="management-form-grid"><label>조건 코드<input name="code" required defaultValue={condition?.code} /></label><label>명칭<input name="name" required defaultValue={condition?.name} /></label><label className="wide">설명<input name="description" required defaultValue={condition?.description} /></label><label>온도 범위<input name="temperature" defaultValue={condition?.temperature} /></label><label>적합 차량<input name="vehicle" defaultValue={condition?.vehicle} /></label><label className="wide">필수 증빙<input name="proof" defaultValue={condition?.proof} /></label></div><FormActions onCancel={onCancel} /></form>;
}

function CrudActions({ name, selected, onCreate, onEdit, onDelete }: { name: string; selected: boolean; onCreate: () => void; onEdit: () => void; onDelete: () => void }): ReactElement { return <span className="management-actions"><button type="button" aria-label={`${name} 등록`} onClick={onCreate}>등록</button><button type="button" aria-label={`${name} 수정`} disabled={!selected} onClick={onEdit}>수정</button><button className="danger" type="button" aria-label={`${name} 삭제`} disabled={!selected} onClick={onDelete}>삭제</button></span>; }
function EditorTitle({ title }: { title: string }): ReactElement { return <div className="tab-line section-heading"><span>{title}</span></div>; }
function FormActions({ onCancel }: { onCancel: () => void }): ReactElement { return <div className="management-form-actions"><button type="button" onClick={onCancel}>취소</button><button className="primary" type="submit">저장</button></div>; }
function EmptyState({ label }: { label: string }): ReactElement { return <div className="management-empty" role="status">{label}</div>; }
function unavailable(remote: boolean): string { return remote ? '미제공' : '-'; }
function text(form: FormData, key: string): string { return String(form.get(key) ?? '').trim(); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '기준정보 저장에 실패했습니다.'; }
