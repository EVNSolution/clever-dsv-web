import type { FormEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { adminCustomerDeliveryPath, customerDeliveryPath } from '../app-routes';
import { apiConfig } from '../api/config';
import {
  AdminSectionHeader,
  AdminTableFrame,
  ManagementDetailAction,
  ManagementEmptyState,
  ManagementFormActions,
  ManagementListActions,
  ManagementSelectionClear,
} from '../components/AdminUi';
import type { ManagementData } from '../demo/management';
import { addressSimilarity, loadManagementData, managementId } from '../demo/management';
import { getCustomerOrders } from '../demo/selectors/customer';
import { emptyManagementData, loadManagementSnapshot, persistManagementChange } from '../services/management';
import { loadManualEmailConfig, sendManualEmail } from '../services/manual-email';
import type { ManualEmailConfig } from '../services/manual-email';
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
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const customer = data.customers.find((item) => item.id === selectedCustomerId);
  const destinations = isRemote
    ? data.destinations
    : customer
      ? data.destinations.filter((item) => item.customerId === customer.id)
      : [];
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const selected = destinations.find((item) => item.id === selectedDestinationId);
  const [editor, setEditor] = useState<NetworkEditor>(null);
  const [addressDraft, setAddressDraft] = useState('');
  const customerOrderCount = customer
    ? isRemote ? customer.orderCount ?? 0 : getCustomerOrders(customer.id).length
    : 0;
  const similarDestinations = !isRemote && addressDraft ? data.destinations
    .filter((item) => item.id !== editor?.id)
    .map((item) => ({ item, score: addressSimilarity(addressDraft, item.address) }))
    .filter(({ score }) => score >= 0.6)
    .sort((left, right) => right.score - left.score) : [];

  const selectCustomer = (customerId: string) => {
    const nextId = selectedCustomerId === customerId ? '' : customerId;
    setSelectedCustomerId(nextId);
    setSelectedDestinationId('');
    setEditor(null);
  };
  const selectDestination = (destinationId: string) => {
    setSelectedDestinationId((current) => current === destinationId ? '' : destinationId);
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
    setSelectedCustomerId(''); setSelectedDestinationId(''); setEditor(null);
  };
  const removeDestination = () => {
    if (!selected || !window.confirm(`${selected.name} 배송지를 영구 삭제합니다.`)) return;
    void onChange({ ...data, destinations: data.destinations.filter((item) => item.id !== selected.id).map((item) => item.sameAsId === selected.id ? { ...item, sameAsId: undefined } : item) }).catch(() => undefined);
    setSelectedDestinationId(''); setEditor(null);
  };

  return (
    <div className="management-network-shell">
      <div className={`resource-workspace ${customer ? 'has-selection' : 'is-idle'}`} aria-label="고객사 관리">
        <section className="page-panel management-list-panel" aria-label="고객사 목록">
          <AdminSectionHeader
            title="고객사 리스트"
            side={<span className="management-heading-side"><span className="section-meta">{data.customers.length}곳</span><ManagementListActions name="고객사" canDelete={!!customer} disabled={isRemote} onCreate={() => setEditor({ kind: 'customer' })} onDelete={removeCustomer} /></span>}
          />
          <AdminTableFrame>
            <table className="page-table master-customer-table"><thead><tr><th>고객사</th><th>고객 코드</th><th>Order</th><th>배송조회</th></tr></thead><tbody>
              {data.customers.map((item) => {
                const orderCount = isRemote ? item.orderCount ?? 0 : getCustomerOrders(item.id).length;
                return <tr className={item.id === customer?.id ? 'active' : ''} key={item.id} tabIndex={0} onClick={() => selectCustomer(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectCustomer(item.id); }}><td><strong>{item.name}</strong></td><td>{item.billingCode || unavailable(isRemote)}</td><td>{orderCount}건</td><td>{orderCount ? <a className="master-customer-link" href={`${adminCustomerDeliveryPath}?customer=${encodeURIComponent(item.id)}`} aria-label={`${item.name} 배송조회`} onClick={(event) => event.stopPropagation()}>배송조회</a> : '-'}</td></tr>;
              })}
            </tbody></table>
            {!data.customers.length ? <EmptyState label="고객사를 등록하세요." /> : null}
          </AdminTableFrame>
        </section>
        <section className="page-panel management-detail-panel customer-detail-panel" aria-label="고객사 상세">
          {editor?.kind === 'customer' ? <CustomerForm customer={data.customers.find((item) => item.id === editor.id)} identityReadOnly={isRemote} onCancel={() => setEditor(null)} onSave={async (saved) => {
            const customers = editor.id ? data.customers.map((item) => item.id === editor.id ? saved : item) : [...data.customers, saved];
            await onChange({ ...data, customers }); setSelectedCustomerId(saved.id); setSelectedDestinationId(data.destinations.find((item) => item.customerId === saved.id)?.id ?? ''); setEditor(null);
          }} /> : <>
            <AdminSectionHeader
              title="고객사 상세"
              side={customer ? <span className="management-heading-side"><span className="section-meta">{customerOrderCount}건 Order</span><ManagementDetailAction name="고객사" onEdit={() => setEditor({ kind: 'customer', id: customer.id })} /><ManagementSelectionClear onClick={() => selectCustomer(customer.id)} /></span> : undefined}
            />
            {customer ? <><div className="master-detail-grid"><dl><dt>고객사</dt><dd>{customer.name}</dd><dt>고객 코드</dt><dd>{customer.billingCode || unavailable(isRemote)}</dd><dt>이메일 알림</dt><dd>{customer.notificationEmailEnabled ? '사용' : '사용 안 함'}</dd><dt>대표 수신자</dt><dd>{customer.notificationEmailRecipient || unavailable(isRemote)}</dd></dl><div><strong>배송지</strong><p>{destinations.length}곳 등록</p></div></div><CustomerInvitationEmailPanel customerName={customer.name} /></> : <EmptyState label="고객사를 선택하면 상세 정보를 확인할 수 있습니다." />}
          </>}
        </section>
      </div>
      <div className={`resource-workspace ${selected ? 'has-selection' : 'is-idle'}`} aria-label="배송지 관리">
        <section className="page-panel management-list-panel master-destination-panel" aria-label="배송지 목록">
          <AdminSectionHeader
            title="배송지 리스트"
            side={<span className="management-heading-side"><span className="section-meta">{destinations.length}곳</span><ManagementListActions name="배송지" canDelete={!!selected} disabled={isRemote || !customer} onCreate={() => openDestinationEditor()} onDelete={removeDestination} /></span>}
          />
          <AdminTableFrame>
            <table className="page-table master-destination-table"><thead><tr><th>배송지</th><th>주소</th><th>동일 주소</th></tr></thead><tbody>
              {destinations.map((item) => <tr className={item.id === selected?.id ? 'active' : ''} key={item.id} tabIndex={0} onClick={() => selectDestination(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectDestination(item.id); } }}><td>{item.name}</td><td>{item.address || unavailable(isRemote)}</td><td>{item.sameAsId ? '연결' : '-'}</td></tr>)}
            </tbody></table>
            {customer && !destinations.length ? <EmptyState label="배송지를 등록하세요." /> : null}
          </AdminTableFrame>
        </section>
        <section className="page-panel management-detail-panel" aria-label="배송지 상세">
          {editor?.kind === 'destination' ? <DestinationForm customerId={customer?.id ?? ''} destination={data.destinations.find((item) => item.id === editor.id)} destinations={data.destinations} address={addressDraft} similar={similarDestinations} onAddressChange={setAddressDraft} onCancel={() => setEditor(null)} onSave={async (saved) => {
            const allDestinations = editor.id ? data.destinations.map((item) => item.id === editor.id ? saved : item) : [...data.destinations, saved];
            await onChange({ ...data, destinations: allDestinations }); setSelectedDestinationId(saved.id); setEditor(null);
          }} /> : <>
            <AdminSectionHeader title="배송지 상세" side={selected ? <span className="management-heading-side"><ManagementDetailAction name="배송지" disabled={isRemote} onEdit={() => openDestinationEditor(selected.id)} /><ManagementSelectionClear onClick={() => selectDestination(selected.id)} /></span> : undefined} />
            {selected ? <div className="master-detail-grid"><dl><dt>배송지</dt><dd>{selected.name}</dd><dt>주소</dt><dd>{selected.address || unavailable(isRemote)}</dd></dl><div><strong>동일 배송지 연결</strong><p>{isRemote ? '미제공' : selected.sameAsId ? data.destinations.find((item) => item.id === selected.sameAsId)?.name ?? '연결된 배송지' : '연결 없음'}</p></div></div> : <EmptyState label={customer || isRemote ? '배송지를 선택하면 상세 정보를 확인할 수 있습니다.' : '고객사를 먼저 선택하세요.'} />}
          </>}
        </section>
      </div>
    </div>
  );
}

function CustomerInvitationEmailPanel({ customerName }: { customerName: string }): ReactElement {
  const [config, setConfig] = useState<ManualEmailConfig | null>(null);
  const [recipient, setRecipient] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<{ error: string | null; loading: boolean; message: string | null; sending: boolean }>({ error: null, loading: true, message: null, sending: false });
  const inquiryUrl = `${window.location.origin}${customerDeliveryPath}`;
  const body = customerEmailBody(config?.defaultTextContent ?? '', customerName, inquiryUrl);
  const canSend = !!config?.configured && !!recipient.trim() && confirmed && !state.loading && !state.sending;

  useEffect(() => {
    let active = true;
    setRecipient('');
    setConfirmed(false);
    setState({ error: null, loading: true, message: null, sending: false });
    loadManualEmailConfig()
      .then((value) => {
        if (!active) return;
        setConfig(value);
        setState({ error: null, loading: false, message: null, sending: false });
      })
      .catch((error) => {
        if (!active) return;
        setConfig(null);
        setState({ error: errorMessage(error), loading: false, message: null, sending: false });
      });
    return () => { active = false; };
  }, [customerName]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!config || !canSend) return;
    setState({ error: null, loading: false, message: null, sending: true });
    try {
      const result = await sendManualEmail({ recipients: [recipient.trim().toLowerCase()], subject: config.defaultSubject, textContent: body });
      setConfirmed(false);
      setState({ error: null, loading: false, message: `${result.recipientCount}명에게 안내 메일을 전송했습니다.`, sending: false });
    } catch (error) {
      setState({ error: errorMessage(error), loading: false, message: null, sending: false });
    }
  };

  return <form className="customer-email-panel" aria-label="계정 안내" onSubmit={submit}>
    <div className="customer-email-heading"><strong>계정 안내</strong><span>저장된 안내문을 확인한 뒤 한 번 전송합니다.</span></div>
    <div className="customer-email-fields">
      <label>수신자 이메일<input type="email" required autoComplete="off" value={recipient} onChange={(event) => { setRecipient(event.target.value); setConfirmed(false); setState((current) => ({ ...current, error: null, message: null })); }} placeholder="customer@example.com" /></label>
      <label>발신자<input readOnly value={config?.senderEmail ?? ''} placeholder={state.loading ? '설정을 불러오는 중입니다.' : '설정에서 발신자를 저장하세요.'} /></label>
    </div>
    <div className="customer-email-subject"><span>제목</span><strong>{config?.defaultSubject || '-'}</strong></div>
    <pre className="customer-email-preview" aria-label="메일 본문 미리보기">{body || '설정에서 이메일 안내문을 저장하세요.'}</pre>
    <div className="customer-email-footer">
      <label className="customer-email-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />수신자와 메일 내용을 확인했습니다.</label>
      <button type="submit" disabled={!canSend}>{state.sending ? '전송 중' : '안내 메일 보내기'}</button>
    </div>
    {state.loading ? <p className="customer-email-status" role="status">이메일 설정을 불러오는 중입니다.</p> : null}
    {!state.loading && config && !config.configured ? <p className="customer-email-status" role="status">설정에서 Brevo API와 발신자 이메일을 먼저 등록하세요.</p> : null}
    {state.message ? <p className="customer-email-status success" role="status">{state.message}</p> : null}
    {state.error ? <p className="customer-email-status error" role="alert">{state.error}</p> : null}
  </form>;
}

function customerEmailBody(template: string, customerName: string, inquiryUrl: string): string {
  const body = template.trim();
  if (!body) return '';
  const withCustomer = /^고객사:[^\r\n]*$/mu.test(body)
    ? body.replace(/^고객사:[^\r\n]*$/mu, `고객사: ${customerName}`)
    : `고객사: ${customerName}\n${body}`;
  return /^배송조회 페이지:[^\r\n]*$/mu.test(withCustomer)
    ? withCustomer.replace(/^배송조회 페이지:[^\r\n]*$/mu, `배송조회 페이지: ${inquiryUrl}`)
    : `${withCustomer}\n\n배송조회 페이지: ${inquiryUrl}`;
}

function ConditionMaster({ data, onChange }: { data: ManagementData; onChange: (data: ManagementData) => Promise<void> }): ReactElement {
  const [selectedId, setSelectedId] = useState(data.conditions[0]?.id ?? '');
  const selected = data.conditions.find((item) => item.id === selectedId) ?? data.conditions[0];
  const [editorId, setEditorId] = useState<string | null>();
  const removeCondition = () => {
    if (!selected || !window.confirm(`${selected.name} 운송조건을 영구 삭제합니다.`)) return;
    const conditions = data.conditions.filter((item) => item.id !== selected.id);
    void onChange({ ...data, conditions }).then(() => {
      setSelectedId(conditions[0]?.id ?? '');
      setEditorId(undefined);
    }).catch(() => undefined);
  };
  return <div className="page-grid master-condition-grid">
    <section className="page-panel wide management-list-panel">
      <AdminSectionHeader title="운송조건" side={<ManagementListActions name="운송조건" canDelete={!!selected} onCreate={() => setEditorId(null)} onDelete={removeCondition} />} />
      <AdminTableFrame>
        <table className="page-table"><thead><tr><th>코드</th><th>명칭</th><th>설명</th></tr></thead><tbody>{data.conditions.map((condition) => <tr className={condition.id === selected?.id ? 'active' : ''} key={condition.id} tabIndex={0} onClick={() => { setSelectedId(condition.id); setEditorId(undefined); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(condition.id); setEditorId(undefined); } }}><td>{condition.code}</td><td>{condition.name}</td><td>{condition.description}</td></tr>)}</tbody></table>
      </AdminTableFrame>
    </section>
    <section className="page-panel wide management-detail-panel">{editorId !== undefined ? <ConditionForm condition={data.conditions.find((item) => item.id === editorId)} onCancel={() => setEditorId(undefined)} onSave={async (saved) => { if (data.conditions.some((item) => item.id !== saved.id && item.code === saved.code)) { window.alert('같은 조건 코드가 이미 등록되어 있습니다.'); return; } const conditions = editorId ? data.conditions.map((item) => item.id === editorId ? saved : item) : [...data.conditions, saved]; await onChange({ ...data, conditions }); setSelectedId(saved.id); setEditorId(undefined); }} /> : <><AdminSectionHeader title="조건 상세" side={selected ? <span className="management-heading-side"><span className="section-meta">{selected.code}</span><ManagementDetailAction name="운송조건" onEdit={() => setEditorId(selected.id)} /></span> : undefined} />{selected ? <div className="master-detail-grid"><dl><dt>표시 명칭</dt><dd>{selected.name}</dd><dt>설명</dt><dd>{selected.description}</dd><dt>온도 알림</dt><dd>{selected.temperatureAlertEnabled ? '사용' : '사용 안 함'}</dd><dt>온도 범위</dt><dd>{conditionTemperatureRange(selected)}</dd></dl></div> : <EmptyState label="운송조건을 등록하세요." />}</>}</section>
  </div>;
}

function CustomerForm({ customer, identityReadOnly = false, onSave, onCancel }: { customer?: ManagementData['customers'][number]; identityReadOnly?: boolean; onSave: (customer: ManagementData['customers'][number]) => void | Promise<void>; onCancel: () => void }): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const notificationEmailEnabled = form.get('notificationEmailEnabled') === 'on';
    const notificationEmailRecipient = text(form, 'notificationEmailRecipient').toLowerCase();
    if (notificationEmailEnabled && (notificationEmailRecipient === '' || !validEmailInput(notificationEmailRecipient))) {
      window.alert('이메일 알림을 사용하려면 올바른 대표 수신자 이메일을 입력하세요.');
      return;
    }
    try {
      await onSave({
        id: customer?.id ?? managementId('customer'),
        name: text(form, 'name'),
        billingCode: text(form, 'billingCode'),
        notificationEmailEnabled,
        notificationEmailRecipient,
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="고객사 편집" onSubmit={submit}><EditorTitle title={customer ? '고객사 수정' : '고객사 등록'} /><div className="management-form-grid"><label>고객사명<input name="name" required readOnly={identityReadOnly} defaultValue={customer?.name} /></label><label>고객 코드<input name="billingCode" required readOnly={identityReadOnly} defaultValue={customer?.billingCode} /></label><label className="management-checkbox-field wide"><span><input name="notificationEmailEnabled" type="checkbox" defaultChecked={customer?.notificationEmailEnabled ?? false} /> 이메일 알림 사용</span></label><label className="wide">대표 수신자 이메일<input name="notificationEmailRecipient" type="email" maxLength={320} defaultValue={customer?.notificationEmailRecipient ?? ''} placeholder="customer@example.com" /></label></div><FormActions onCancel={onCancel} /></form>;
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
    const temperatureMinC = nullableNumber(form, 'temperatureMinC');
    const temperatureMaxC = nullableNumber(form, 'temperatureMaxC');
    if (temperatureMinC !== null && temperatureMaxC !== null && temperatureMinC > temperatureMaxC) {
      window.alert('온도 최소값은 최대값보다 클 수 없습니다.');
      return;
    }
    try {
      await onSave({
        id: condition?.id ?? managementId('condition'),
        code: text(form, 'code'),
        name: text(form, 'name'),
        description: text(form, 'description'),
        temperatureAlertEnabled: form.get('temperatureAlertEnabled') === 'on',
        temperatureMinC,
        temperatureMaxC,
        temperature: condition?.temperature ?? '',
        vehicle: condition?.vehicle ?? '',
        proof: condition?.proof ?? '',
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="운송조건 편집" onSubmit={submit}><EditorTitle title={condition ? '운송조건 수정' : '운송조건 등록'} /><div className="management-form-grid"><label>조건 코드<input name="code" required maxLength={80} defaultValue={condition?.code} /></label><label>명칭<input name="name" required maxLength={160} defaultValue={condition?.name} /></label><label className="wide">설명<input name="description" required maxLength={1000} defaultValue={condition?.description} /></label><label className="management-checkbox-field wide"><span><input name="temperatureAlertEnabled" type="checkbox" defaultChecked={condition?.temperatureAlertEnabled ?? false} /> 온도 알림 사용</span></label><label>최소 ℃<input name="temperatureMinC" inputMode="decimal" type="number" step="0.1" min="-50" max="50" defaultValue={condition?.temperatureMinC ?? ''} /></label><label>최대 ℃<input name="temperatureMaxC" inputMode="decimal" type="number" step="0.1" min="-50" max="50" defaultValue={condition?.temperatureMaxC ?? ''} /></label></div><FormActions onCancel={onCancel} /></form>;
}

function EditorTitle({ title }: { title: string }): ReactElement { return <AdminSectionHeader title={title} />; }
function FormActions({ onCancel }: { onCancel: () => void }): ReactElement { return <ManagementFormActions onCancel={onCancel} />; }
function EmptyState({ label }: { label: string }): ReactElement { return <ManagementEmptyState>{label}</ManagementEmptyState>; }
function unavailable(remote: boolean): string { return remote ? '미제공' : '-'; }
function text(form: FormData, key: string): string { return String(form.get(key) ?? '').trim(); }
function validEmailInput(value: string): boolean { return value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value); }
function nullableNumber(form: FormData, key: string): number | null {
  const value = String(form.get(key) ?? '').trim();
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function conditionTemperatureRange(condition: ManagementData['conditions'][number]): string {
  const min = condition.temperatureMinC === null ? null : `${condition.temperatureMinC}℃`;
  const max = condition.temperatureMaxC === null ? null : `${condition.temperatureMaxC}℃`;
  if (min && max) return `${min} - ${max}`;
  if (min) return `${min} 이상`;
  if (max) return `${max} 이하`;
  return '-';
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : '기준정보 저장에 실패했습니다.'; }
