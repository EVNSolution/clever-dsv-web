import type { FormEvent, KeyboardEvent, ReactElement } from 'react';
import { useEffect, useState } from 'react';
import {
  AdminSectionHeader,
  AdminTableFrame,
  ManagementDetailAction,
  ManagementEmptyState,
  ManagementFormActions,
  ManagementListActions,
  ManagementSelectionClear,
} from '../components/AdminUi';
import { DriverInviteDialog } from '../components/DriverInviteDialog';
import type { ManagementData, ManagementDriver, ManagementVehicle } from '../demo/management';
import { managementId } from '../demo/management';

type ResourceEditor =
  | { id?: string; kind: 'driver' }
  | { id?: string; kind: 'vehicle' }
  | null;

export function ResourcesPage({
  data,
  onChange,
}: {
  data: ManagementData;
  onChange: (data: ManagementData) => Promise<void>;
}): ReactElement {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [editor, setEditor] = useState<ResourceEditor>(null);

  return (
    <div className="management-resource-shell">
      <DriverWorkspace
        data={data}
        editor={editor?.kind === 'driver' ? editor : null}
        selectedId={selectedDriverId}
        onChange={onChange}
        onEdit={setEditor}
        onSelect={(id) => {
          setSelectedDriverId((current) => current === id ? '' : id);
          setEditor(null);
        }}
      />
      <VehicleWorkspace
        data={data}
        editor={editor?.kind === 'vehicle' ? editor : null}
        selectedId={selectedVehicleId}
        onChange={onChange}
        onEdit={setEditor}
        onSelect={(id) => {
          setSelectedVehicleId((current) => current === id ? '' : id);
          setEditor(null);
        }}
      />
    </div>
  );
}

function DriverWorkspace({
  data,
  editor,
  onChange,
  onEdit,
  onSelect,
  selectedId,
}: {
  data: ManagementData;
  editor: Extract<NonNullable<ResourceEditor>, { kind: 'driver' }> | null;
  onChange: (data: ManagementData) => Promise<void>;
  onEdit: (editor: ResourceEditor) => void;
  onSelect: (id: string) => void;
  selectedId: string;
}): ReactElement {
  const [inviteOpen, setInviteOpen] = useState(false);
  const selectedDriver = data.drivers.find((driver) => driver.id === selectedId);
  const removeDriver = () => {
    if (!selectedDriver || !window.confirm(`${selectedDriver.name} 배송원을 영구 삭제합니다.`)) return;
    void onChange({
      ...data,
      assignments: data.assignments.filter((assignment) => assignment.driverId !== selectedDriver.id),
      drivers: data.drivers.filter((driver) => driver.id !== selectedDriver.id),
    }).then(() => onSelect(selectedDriver.id)).catch(() => undefined);
  };

  return (
    <div className={`resource-workspace ${selectedDriver ? 'has-selection' : 'is-idle'}`} aria-label="배송원 관리">
      <section className="page-panel management-list-panel" aria-label="배송원 리스트">
        <AdminSectionHeader
          title="배송원 리스트"
          side={<span className="management-heading-side"><span className="section-meta">{data.drivers.length}명</span><span className="management-actions"><button className="invite" type="button" onClick={() => setInviteOpen(true)}>초대 생성</button></span><ManagementListActions name="배송원" canDelete={!!selectedDriver} onCreate={() => onEdit({ kind: 'driver' })} onDelete={removeDriver} /></span>}
        />
        <AdminTableFrame className="courier-list">
          <table className="courier-list-table page-table">
            <thead><tr><th>배송원</th><th>연락처</th><th>배정 차량</th></tr></thead>
            <tbody>{data.drivers.map((driver) => (
              <tr
                aria-selected={selectedDriver?.id === driver.id}
                className={selectedDriver?.id === driver.id ? 'active' : ''}
                key={driver.id}
                onClick={() => onSelect(driver.id)}
                onKeyDown={(event) => activateRow(event, () => onSelect(driver.id))}
                tabIndex={0}
              >
                <td><strong>{driver.name}</strong></td>
                <td>{driver.phone || '-'}</td>
                <td>{assignedVehicles(data, driver.id)}</td>
              </tr>
            ))}</tbody>
          </table>
          {!data.drivers.length ? <EmptyState label="등록된 배송원이 없습니다." /> : null}
        </AdminTableFrame>
      </section>
      <section className="page-panel management-detail-panel" aria-label="배송원 상세">
        {editor ? (
          <DriverForm
            driver={data.drivers.find((driver) => driver.id === editor.id)}
            onCancel={() => onEdit(null)}
            onSave={async (saved) => {
              const drivers = editor.id
                ? data.drivers.map((driver) => driver.id === editor.id ? saved : driver)
                : [...data.drivers, saved];
              await onChange({ ...data, drivers });
              if (selectedDriver?.id !== saved.id) onSelect(saved.id);
              onEdit(null);
            }}
          />
        ) : (
          <>
            <AdminSectionHeader
              title="배송원 상세"
              side={selectedDriver ? <span className="management-heading-side"><ManagementDetailAction name="배송원" onEdit={() => onEdit({ id: selectedDriver.id, kind: 'driver' })} /><ManagementSelectionClear onClick={() => onSelect(selectedDriver.id)} /></span> : undefined}
            />
            {selectedDriver ? (
              <dl className="management-detail">
                <div><dt>이름</dt><dd>{selectedDriver.name}</dd></div>
                <div><dt>연락처</dt><dd>{selectedDriver.phone || '-'}</dd></div>
                <div><dt>배정 차량</dt><dd>{assignedVehicles(data, selectedDriver.id)}</dd></div>
              </dl>
            ) : <EmptyState label="배송원을 선택하면 상세 정보를 확인할 수 있습니다." />}
          </>
        )}
      </section>
      {inviteOpen ? <DriverInviteDialog onClose={() => setInviteOpen(false)} /> : null}
    </div>
  );
}

function VehicleWorkspace({
  data,
  editor,
  onChange,
  onEdit,
  onSelect,
  selectedId,
}: {
  data: ManagementData;
  editor: Extract<NonNullable<ResourceEditor>, { kind: 'vehicle' }> | null;
  onChange: (data: ManagementData) => Promise<void>;
  onEdit: (editor: ResourceEditor) => void;
  onSelect: (id: string) => void;
  selectedId: string;
}): ReactElement {
  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === selectedId);
  const selectedAssignment = selectedVehicle ? assignmentForVehicle(data, selectedVehicle.id) : undefined;
  const selectedDriver = selectedAssignment ? data.drivers.find((driver) => driver.id === selectedAssignment.driverId) : undefined;
  const unassignedDrivers = data.drivers.filter((driver) => assignmentForDriver(data, driver.id) === undefined);
  const [assignmentDriverId, setAssignmentDriverId] = useState('');
  useEffect(() => {
    setAssignmentDriverId('');
  }, [selectedId]);
  const removeVehicle = () => {
    if (!selectedVehicle || !window.confirm(`${selectedVehicle.plate || selectedVehicle.type} 차량을 영구 삭제합니다.`)) return;
    void onChange({
      ...data,
      assignments: data.assignments.filter((assignment) => assignment.vehicleId !== selectedVehicle.id),
      vehicles: data.vehicles.filter((vehicle) => vehicle.id !== selectedVehicle.id),
    }).then(() => onSelect(selectedVehicle.id)).catch(() => undefined);
  };
  const assignDriver = () => {
    if (!selectedVehicle || selectedAssignment) return;
    const driver = unassignedDrivers.find((item) => item.id === assignmentDriverId);
    if (!driver) return;
    void onChange({
      ...data,
      assignments: [...data.assignments, {
        driverId: driver.id,
        id: managementId('assignment'),
        kind: '기본 배정',
        vehicleId: selectedVehicle.id,
      }],
    }).then(() => setAssignmentDriverId('')).catch(() => undefined);
  };
  const unassignDriver = () => {
    if (!selectedAssignment) return;
    void onChange({
      ...data,
      assignments: data.assignments.filter((assignment) => assignment.id !== selectedAssignment.id),
    }).then(() => setAssignmentDriverId('')).catch(() => undefined);
  };

  return (
    <div className={`resource-workspace ${selectedVehicle ? 'has-selection' : 'is-idle'}`} aria-label="차량 관리">
      <section className="page-panel management-list-panel" aria-label="차량 리스트">
        <AdminSectionHeader
          title="차량 리스트"
          side={<span className="management-heading-side"><span className="section-meta">{data.vehicles.length}대</span><ManagementListActions name="차량" canDelete={!!selectedVehicle} onCreate={() => onEdit({ kind: 'vehicle' })} onDelete={removeVehicle} /></span>}
        />
        <AdminTableFrame>
          <table className="page-table">
            <thead><tr><th>차량 번호</th><th>차종</th><th>배정 배송원</th><th>TMS 일련번호</th></tr></thead>
            <tbody>{data.vehicles.map((vehicle) => (
              <tr
                aria-selected={selectedVehicle?.id === vehicle.id}
                className={selectedVehicle?.id === vehicle.id ? 'active' : ''}
                key={vehicle.id}
                onClick={() => onSelect(vehicle.id)}
                onKeyDown={(event) => activateRow(event, () => onSelect(vehicle.id))}
                tabIndex={0}
              >
                <td><strong>{vehicle.plate || '-'}</strong></td>
                <td>{vehicle.type || '-'}</td>
                <td>{assignedDrivers(data, vehicle.id)}</td>
                <td>{vehicle.telematicsSerialNumber || '-'}</td>
              </tr>
            ))}</tbody>
          </table>
          {!data.vehicles.length ? <EmptyState label="등록된 차량이 없습니다." /> : null}
        </AdminTableFrame>
      </section>
      <section className="page-panel management-detail-panel" aria-label="차량 상세">
        {editor ? (
          <VehicleForm
            vehicle={data.vehicles.find((vehicle) => vehicle.id === editor.id)}
            onCancel={() => onEdit(null)}
            onSave={async (saved) => {
              const vehicles = editor.id
                ? data.vehicles.map((vehicle) => vehicle.id === editor.id ? saved : vehicle)
                : [...data.vehicles, saved];
              await onChange({ ...data, vehicles });
              if (selectedVehicle?.id !== saved.id) onSelect(saved.id);
              onEdit(null);
            }}
          />
        ) : (
          <>
            <AdminSectionHeader
              title="차량 상세"
              side={selectedVehicle ? <span className="management-heading-side"><ManagementDetailAction name="차량" onEdit={() => onEdit({ id: selectedVehicle.id, kind: 'vehicle' })} /><ManagementSelectionClear onClick={() => onSelect(selectedVehicle.id)} /></span> : undefined}
            />
            {selectedVehicle ? (
              <>
                <dl className="management-detail">
                  <div><dt>차량 번호</dt><dd>{selectedVehicle.plate || '-'}</dd></div>
                  <div><dt>차종</dt><dd>{selectedVehicle.type || '-'}</dd></div>
                  <div><dt>기본 배송원</dt><dd>{selectedDriver?.name ?? '-'}</dd></div>
                  <div><dt>TMS 일련번호</dt><dd>{selectedVehicle.telematicsSerialNumber || '-'}</dd></div>
                </dl>
                <section className="vehicle-assignment-card" aria-label="기본 배송원 배정">
                  <AdminSectionHeader title="기본 배송원" side={<span className="section-meta">{selectedDriver?.name ?? '미배정'}</span>} />
                  <div className="vehicle-assignment-controls">
                    <label>배송원
                      <select
                        aria-label="배정할 배송원"
                        disabled={!!selectedAssignment || unassignedDrivers.length === 0}
                        value={selectedDriver?.id ?? assignmentDriverId}
                        onChange={(event) => setAssignmentDriverId(event.target.value)}
                      >
                        {selectedDriver ? <option value={selectedDriver.id}>{selectedDriver.name}</option> : <option value="">미배정 배송원 선택</option>}
                        {unassignedDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
                      </select>
                    </label>
                    <span className="management-actions">
                      <button type="button" disabled={!!selectedAssignment || assignmentDriverId === ''} onClick={assignDriver}>배정</button>
                      <button className="danger" type="button" disabled={!selectedAssignment} onClick={unassignDriver}>해제</button>
                    </span>
                  </div>
                </section>
              </>
            ) : <EmptyState label="차량을 선택하면 상세 정보를 확인할 수 있습니다." />}
          </>
        )}
      </section>
    </div>
  );
}

function DriverForm({
  driver,
  onCancel,
  onSave,
}: {
  driver?: ManagementDriver;
  onCancel: () => void;
  onSave: (driver: ManagementDriver) => void | Promise<void>;
}): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        age: driver?.age ?? 0,
        career: driver?.career ?? '미제공',
        gender: driver?.gender ?? '미제공',
        id: driver?.id ?? managementId('driver'),
        name: text(form, 'name'),
        phone: text(form, 'phone'),
        score: driver?.score ?? '미제공',
        traits: driver?.traits ?? [],
        zone: driver?.zone ?? '미제공',
      });
    } catch {}
  };
  return (
    <form className="management-editor" aria-label="배송원 편집" onSubmit={submit}>
      <AdminSectionHeader title={driver ? '배송원 수정' : '배송원 등록'} />
      <div className="management-form-grid">
        <label>이름<input name="name" required maxLength={80} defaultValue={driver?.name} /></label>
        <label>연락처<input name="phone" maxLength={40} defaultValue={driver?.phone} /></label>
      </div>
      <ManagementFormActions onCancel={onCancel} />
    </form>
  );
}

function VehicleForm({
  onCancel,
  onSave,
  vehicle,
}: {
  onCancel: () => void;
  onSave: (vehicle: ManagementVehicle) => void | Promise<void>;
  vehicle?: ManagementVehicle;
}): ReactElement {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await onSave({
        id: vehicle?.id ?? managementId('vehicle'),
        note: text(form, 'note'),
        plate: text(form, 'plate'),
        telematicsCapabilities: vehicle?.telematicsCapabilities,
        telematicsSerialNumber: text(form, 'telematicsSerialNumber') || undefined,
        type: text(form, 'type'),
      });
    } catch {}
  };
  return (
    <form className="management-editor" aria-label="차량 편집" onSubmit={submit}>
      <AdminSectionHeader title={vehicle ? '차량 수정' : '차량 등록'} />
      <div className="management-form-grid">
        <label>차량 번호<input name="plate" required maxLength={40} defaultValue={vehicle?.plate} /></label>
        <label>차종<input name="type" required maxLength={160} defaultValue={vehicle?.type} /></label>
        <label>TMS 일련번호<input name="telematicsSerialNumber" maxLength={160} defaultValue={vehicle?.telematicsSerialNumber} /></label>
        <label>메모<input name="note" maxLength={1000} defaultValue={vehicle?.note} /></label>
      </div>
      <ManagementFormActions onCancel={onCancel} />
    </form>
  );
}

function EmptyState({ label }: { label: string }): ReactElement {
  return <ManagementEmptyState>{label}</ManagementEmptyState>;
}

function activateRow(event: KeyboardEvent<HTMLTableRowElement>, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function assignedVehicles(data: ManagementData, driverId: string): string {
  const assignment = assignmentForDriver(data, driverId);
  const vehicle = data.vehicles.find((item) => item.id === assignment?.vehicleId);
  return vehicle ? (vehicle.plate || vehicle.type) : '-';
}

function assignedDrivers(data: ManagementData, vehicleId: string): string {
  const assignment = assignmentForVehicle(data, vehicleId);
  const driver = data.drivers.find((item) => item.id === assignment?.driverId);
  return driver?.name ?? '-';
}

function assignmentForDriver(data: ManagementData, driverId: string): ManagementData['assignments'][number] | undefined {
  return data.assignments.find((assignment) => assignment.driverId === driverId);
}

function assignmentForVehicle(data: ManagementData, vehicleId: string): ManagementData['assignments'][number] | undefined {
  return data.assignments.find((assignment) => assignment.vehicleId === vehicleId);
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}
