import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { apiConfig } from '../api/config';
import type { ManagementData } from '../demo/management';
import { managementId } from '../demo/management';
import { historyForDriver, vehiclesForDriver } from '../demo/selectors/management';

type ResourceScope = 'drivers' | 'vehicles';
type Editor = { scope: ResourceScope; id?: string } | null;

export function ResourcesPage({ data, onChange }: { data: ManagementData; onChange: (data: ManagementData) => Promise<void> }): ReactElement {
  const [scope, setScope] = useState<ResourceScope>('drivers');
  const [editor, setEditor] = useState<Editor>(null);
  const [selectedDriverId, setSelectedDriverId] = useState(data.drivers[0]?.id ?? '');
  const [selectedVehicleId, setSelectedVehicleId] = useState(data.vehicles[0]?.id ?? '');
  const driver = data.drivers.find((item) => item.id === selectedDriverId) ?? data.drivers[0];
  const vehicle = data.vehicles.find((item) => item.id === selectedVehicleId) ?? data.vehicles[0];

  const selectScope = (next: ResourceScope) => {
    setScope(next);
    setEditor(null);
  };

  return (
    <div className="management-resource-shell">
      <nav className="management-subnav" aria-label="운송자원 범주">
        <button type="button" aria-pressed={scope === 'drivers'} onClick={() => selectScope('drivers')}>배송원</button>
        <button type="button" aria-pressed={scope === 'vehicles'} onClick={() => selectScope('vehicles')}>차량</button>
      </nav>
      {scope === 'drivers' ? <DriverCrud data={data} driver={driver} editor={editor} onChange={onChange} onEdit={setEditor} onSelect={setSelectedDriverId} /> : null}
      {scope === 'vehicles' ? <VehicleCrud data={data} vehicle={vehicle} editor={editor} onChange={onChange} onEdit={setEditor} onSelect={setSelectedVehicleId} /> : null}
    </div>
  );
}

function DriverCrud({ data, driver, editor, onChange, onEdit, onSelect }: {
  data: ManagementData;
  driver?: ManagementData['drivers'][number];
  editor: Editor;
  onChange: (data: ManagementData) => Promise<void>;
  onEdit: (editor: Editor) => void;
  onSelect: (id: string) => void;
}): ReactElement {
  const isRemote = apiConfig.mode === 'remote';
  const assignedVehicles = driver ? vehiclesForDriver(data.vehicles, data.assignments, driver.id) : [];
  const deliveryHistory = !isRemote && driver ? historyForDriver(driver.id) : [];
  const remove = async () => {
    if (!driver || !window.confirm(`${driver.name} 배송원을 영구 삭제합니다.`)) return;
    const drivers = data.drivers.filter((item) => item.id !== driver.id);
    try {
      await onChange({ ...data, drivers, assignments: data.assignments.filter((item) => item.driverId !== driver.id) });
      onSelect(drivers[0]?.id ?? '');
      onEdit(null);
    } catch {}
  };

  return (
    <div className="courier-grid">
      <section className="page-panel" aria-label="배송원 리스트">
        <div className="tab-line section-heading"><span>배송원 리스트</span><span className="management-heading-side"><span className="section-meta">{data.drivers.length}명</span><CreateAction name="배송원" onClick={() => onEdit({ scope: 'drivers' })} /></span></div>
        <div className="courier-list overlay-scroll">
          <table className="courier-list-table"><thead><tr><th>배송원</th><th>연령</th><th>성별</th><th>담당 권역</th><th>차량</th></tr></thead><tbody>
            {data.drivers.map((person) => {
              const assignedVehicle = vehiclesForDriver(data.vehicles, data.assignments, person.id)[0];
              return <tr key={person.id} className={person.id === driver?.id ? 'active' : ''} data-courier-id={person.id} aria-selected={person.id === driver?.id} tabIndex={0} onClick={() => { onSelect(person.id); onEdit(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(person.id); onEdit(null); } }}><td><strong>{person.name}</strong></td><td>{isRemote ? '미제공' : `${person.age}세`}</td><td>{person.gender || unavailable(isRemote)}</td><td>{person.zone || unavailable(isRemote)}</td><td><span className="chip mini">{assignedVehicle ? assignedVehicle.plate || assignedVehicle.type : '-'}</span></td></tr>;
            })}
          </tbody></table>
          {!data.drivers.length ? <EmptyState label="등록된 배송원이 없습니다." /> : null}
        </div>
      </section>
      <section className="page-panel courier-detail-panel" aria-label="배송원 상세">
        {editor?.scope === 'drivers' ? <DriverForm driver={data.drivers.find((item) => item.id === editor.id)} onCancel={() => onEdit(null)} onSave={async (saved) => {
          const drivers = editor.id ? data.drivers.map((item) => item.id === editor.id ? saved : item) : [...data.drivers, saved];
          await onChange({ ...data, drivers }); onSelect(saved.id); onEdit(null);
        }} /> : driver ? <>
          <div className="tab-line section-heading"><span>배송원 상세</span><span className="management-heading-side"><span className="section-meta">{isRemote ? `상태 ${driver.score || '미제공'}` : `등급 ${driver.score}`}</span><DetailActions canEdit={!isRemote} name="배송원" onEdit={() => onEdit({ scope: 'drivers', id: driver.id })} onDelete={remove} /></span></div>
          <div className="courier-detail-head compact"><div className="driver-avatar" aria-hidden="true">{driver.name.slice(0, 1)}</div><div><div className="courier-person-line"><strong>{driver.name}</strong><small>{isRemote ? '프로필 미제공' : `${driver.age}세 ${driver.gender}`}</small></div><p className="tab-copy">{isRemote ? '담당 권역 미제공' : `${driver.career} ${driver.zone}`}</p></div></div>
          <div className="trait-list">{driver.traits.length ? driver.traits.map((trait) => <span key={trait}>{trait}</span>) : <span>{unavailable(isRemote)}</span>}</div>
          <div className="work-section"><div className="tab-line section-heading"><span>차량</span><span className="section-meta">{assignedVehicles.length}대</span></div><div className="courier-vehicle-list">{assignedVehicles.map((item) => <button key={item.id} className="courier-vehicle-row" type="button"><span><strong>{item.plate || unavailable(isRemote)}</strong><small>{item.type}</small></span></button>)}{!assignedVehicles.length ? <EmptyState label="배정된 차량이 없습니다." /> : null}</div></div>
          <div className="work-section"><div className="tab-line section-heading"><span>배송 기록</span><span className="section-meta">{deliveryHistory.length}건</span></div><div className="courier-history-scroll overlay-scroll"><table className="page-table courier-history-table"><thead><tr><th>완료 일시</th><th>배송지</th><th>차량</th></tr></thead><tbody>{deliveryHistory.map((item) => <tr key={`${item.vehicleId}-${item.destination}`}><td>{formatCompletedAt(item.completedAt)}</td><td>{item.destination}</td><td>{item.plate}</td></tr>)}</tbody></table>{!deliveryHistory.length ? <EmptyState label="배송 기록이 없습니다." /> : null}</div></div>
        </> : <EmptyState label="배송원을 등록하세요." />}
      </section>
    </div>
  );
}

function VehicleCrud({ data, vehicle, editor, onChange, onEdit, onSelect }: {
  data: ManagementData;
  vehicle?: ManagementData['vehicles'][number];
  editor: Editor;
  onChange: (data: ManagementData) => Promise<void>;
  onEdit: (editor: Editor) => void;
  onSelect: (id: string) => void;
}): ReactElement {
  const isRemote = apiConfig.mode === 'remote';
  const [assignmentDriverId, setAssignmentDriverId] = useState(data.drivers[0]?.id ?? '');
  const selectedAssignmentDriverId = data.drivers.some((item) => item.id === assignmentDriverId) ? assignmentDriverId : (data.drivers[0]?.id ?? '');
  const vehicleAssignments = vehicle ? data.assignments.filter((item) => item.vehicleId === vehicle.id) : [];
  const remove = async () => {
    if (!vehicle || !window.confirm(`${vehicle.plate} 차량을 영구 삭제합니다.`)) return;
    const vehicles = data.vehicles.filter((item) => item.id !== vehicle.id);
    try {
      await onChange({ ...data, vehicles, assignments: data.assignments.filter((item) => item.vehicleId !== vehicle.id) });
      onSelect(vehicles[0]?.id ?? ''); onEdit(null);
    } catch {}
  };
  const assignDriver = async () => {
    if (!vehicle || !selectedAssignmentDriverId || data.assignments.some((item) => item.vehicleId === vehicle.id && item.driverId === selectedAssignmentDriverId)) return;
    try {
      await onChange({ ...data, assignments: [...data.assignments, { id: managementId('assignment'), vehicleId: vehicle.id, driverId: selectedAssignmentDriverId, kind: '기본 배정' }] });
    } catch {}
  };

  return <div className="page-grid resource-crud-grid">
    <section className="page-panel" aria-label="차량 리스트">
      <div className="tab-line section-heading"><span>차량 리스트</span><span className="management-heading-side"><span className="section-meta">{data.vehicles.length}대</span><CreateAction name="차량" onClick={() => onEdit({ scope: 'vehicles' })} /></span></div>
      <div className="record-scroll overlay-scroll"><table className="page-table"><thead><tr><th>차량 번호</th><th>{isRemote ? '차량명' : '차종'}</th><th>메모</th></tr></thead><tbody>{data.vehicles.map((item) => <tr key={item.id} className={item.id === vehicle?.id ? 'active' : ''} tabIndex={0} onClick={() => { onSelect(item.id); onEdit(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.id); onEdit(null); } }}><td><strong>{item.plate || unavailable(isRemote)}</strong></td><td>{item.type}</td><td>{item.note || unavailable(isRemote)}</td></tr>)}</tbody></table></div>
    </section>
    <section className="page-panel" aria-label="차량 상세">
      {editor?.scope === 'vehicles' ? <VehicleForm vehicle={data.vehicles.find((item) => item.id === editor.id)} onCancel={() => onEdit(null)} onSave={async (saved) => {
        const vehicles = editor.id ? data.vehicles.map((item) => item.id === editor.id ? saved : item) : [...data.vehicles, saved];
        await onChange({ ...data, vehicles }); onSelect(saved.id); onEdit(null);
      }} /> : vehicle ? <>
        <div className="tab-line section-heading"><span>차량 상세</span><DetailActions canEdit={!isRemote} name="차량" onEdit={() => onEdit({ scope: 'vehicles', id: vehicle.id })} onDelete={remove} /></div>
        <dl className="management-detail"><div><dt>차량 번호</dt><dd>{vehicle.plate || unavailable(isRemote)}</dd></div><div><dt>{isRemote ? '차량명' : '차종'}</dt><dd>{vehicle.type}</dd></div><div><dt>메모</dt><dd>{vehicle.note || unavailable(isRemote)}</dd></div></dl>
        <div className="work-section vehicle-assignment-card" aria-label="배송원 배정">
          <div className="tab-line section-heading"><span>배송원 배정</span><span className="section-meta">{vehicleAssignments.length}명</span></div>
          <div className="vehicle-assignment-controls"><label><span>배송원</span><select aria-label="배송원 선택" value={selectedAssignmentDriverId} onChange={(event) => setAssignmentDriverId(event.target.value)}>{data.drivers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span className="management-actions"><button type="button" disabled={!selectedAssignmentDriverId} onClick={assignDriver}>배정</button></span></div>
          <div className="courier-history-scroll overlay-scroll"><table className="page-table courier-history-table"><thead><tr><th>배송원</th><th>담당 권역</th><th>작업</th></tr></thead><tbody>{vehicleAssignments.map((item) => { const person = data.drivers.find((entry) => entry.id === item.driverId); return person ? <tr key={item.id}><td>{person.name}</td><td>{person.zone || unavailable(isRemote)}</td><td><span className="management-actions"><button type="button" aria-label={`${person.name} 배정 해제`} onClick={() => { void onChange({ ...data, assignments: data.assignments.filter((entry) => entry.id !== item.id) }).catch(() => undefined); }}>해제</button></span></td></tr> : null; })}</tbody></table>{!vehicleAssignments.length ? <EmptyState label="배정된 배송원이 없습니다." /> : null}</div>
        </div>
      </> : <EmptyState label="차량을 등록하세요." />}
    </section>
  </div>;
}

function DriverForm({ driver, onSave, onCancel }: { driver?: ManagementData['drivers'][number]; onSave: (driver: ManagementData['drivers'][number]) => Promise<void>; onCancel: () => void }): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        id: driver?.id ?? managementId('driver'),
        name: text(form, 'name'),
        age: Number(form.get('age')),
        gender: text(form, 'gender'),
        career: text(form, 'career'),
        zone: text(form, 'zone'),
        score: text(form, 'score'),
        traits: text(form, 'traits').split(',').map((item) => item.trim()).filter(Boolean),
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="배송원 편집" onSubmit={submit}><EditorTitle title={driver ? '배송원 수정' : '배송원 등록'} /><div className="management-form-grid"><label>이름<input name="name" required defaultValue={driver?.name} /></label><label>연령<input name="age" type="number" min="18" required defaultValue={driver?.age ?? 30} /></label><label>성별<select name="gender" defaultValue={driver?.gender ?? '남성'}><option>남성</option><option>여성</option></select></label><label>등급<input name="score" required defaultValue={driver?.score ?? 'A'} /></label><label>경력<input name="career" required defaultValue={driver?.career} /></label><label>담당 권역<input name="zone" required defaultValue={driver?.zone} /></label><label className="wide">업무 특성<input name="traits" defaultValue={driver?.traits.join(', ')} placeholder="쉼표로 구분" /></label></div><FormActions onCancel={onCancel} /></form>;
}

function VehicleForm({ vehicle, onSave, onCancel }: { vehicle?: ManagementData['vehicles'][number]; onSave: (vehicle: ManagementData['vehicles'][number]) => Promise<void>; onCancel: () => void }): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        id: vehicle?.id ?? managementId('vehicle'),
        plate: text(form, 'plate'),
        type: text(form, 'type'),
        note: text(form, 'note'),
      });
    } catch {}
  };
  return <form className="management-editor" aria-label="차량 편집" onSubmit={submit}><EditorTitle title={vehicle ? '차량 수정' : '차량 등록'} /><div className="management-form-grid"><label>차량 번호<input name="plate" required defaultValue={vehicle?.plate} /></label><label>차종<input name="type" required defaultValue={vehicle?.type ?? '냉장탑차'} /></label><label className="wide">메모<input name="note" defaultValue={vehicle?.note} /></label></div><FormActions onCancel={onCancel} /></form>;
}

function CreateAction({ name, onClick }: { name: string; onClick: () => void }): ReactElement { return <span className="management-actions"><button type="button" aria-label={`${name} 등록`} onClick={onClick}>등록</button></span>; }
function DetailActions({ canEdit = true, name, onEdit, onDelete }: { canEdit?: boolean; name: string; onEdit: () => void; onDelete: () => void }): ReactElement { return <span className="management-actions"><button type="button" aria-label={`${name} 수정`} disabled={!canEdit} onClick={onEdit}>수정</button><button className="danger" type="button" aria-label={`${name} 삭제`} onClick={onDelete}>삭제</button></span>; }
function EditorTitle({ title }: { title: string }): ReactElement { return <div className="tab-line section-heading"><span>{title}</span></div>; }
function FormActions({ onCancel }: { onCancel: () => void }): ReactElement { return <div className="management-form-actions"><button type="button" onClick={onCancel}>취소</button><button className="primary" type="submit">저장</button></div>; }
function EmptyState({ label }: { label: string }): ReactElement { return <div className="management-empty" role="status">{label}</div>; }
function unavailable(remote: boolean): string { return remote ? '미제공' : '-'; }
function formatCompletedAt(value: string): string { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date(value)); }
function text(form: FormData, key: string): string { return String(form.get(key) ?? '').trim(); }
