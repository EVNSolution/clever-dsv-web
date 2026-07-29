import type { KeyboardEvent, ReactElement } from 'react';
import { useState } from 'react';
import { AdminSectionHeader, AdminTableFrame, ManagementEmptyState } from '../components/AdminUi';
import type { ManagementData } from '../demo/management';

export function ResourcesPage({ data }: { data: ManagementData }): ReactElement {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  return (
    <div className="management-resource-shell">
      <DriverWorkspace
        data={data}
        selectedId={selectedDriverId}
        onSelect={(id) => setSelectedDriverId((current) => current === id ? '' : id)}
      />
      <VehicleWorkspace
        data={data}
        selectedId={selectedVehicleId}
        onSelect={(id) => setSelectedVehicleId((current) => current === id ? '' : id)}
      />
    </div>
  );
}

function DriverWorkspace({
  data,
  onSelect,
  selectedId,
}: {
  data: ManagementData;
  onSelect: (id: string) => void;
  selectedId: string;
}): ReactElement {
  const selectedDriver = data.drivers.find((driver) => driver.id === selectedId);

  return (
    <div className={`resource-workspace ${selectedDriver ? 'has-selection' : 'is-idle'}`} aria-label="배송원 관리">
      <section className="page-panel management-list-panel" aria-label="배송원 리스트">
        <AdminSectionHeader title="배송원 리스트" side={<span className="section-meta">{data.drivers.length}명</span>} />
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
        <AdminSectionHeader
          title="배송원 상세"
          side={selectedDriver ? <SelectionClearButton onClick={() => onSelect(selectedDriver.id)} /> : null}
        />
        {selectedDriver ? (
          <dl className="management-detail">
            <div><dt>이름</dt><dd>{selectedDriver.name}</dd></div>
            <div><dt>연락처</dt><dd>{selectedDriver.phone || '-'}</dd></div>
            <div><dt>배정 차량</dt><dd>{assignedVehicles(data, selectedDriver.id)}</dd></div>
          </dl>
        ) : <EmptyState label="배송원을 선택하면 상세 정보를 확인할 수 있습니다." />}
      </section>
    </div>
  );
}

function VehicleWorkspace({
  data,
  onSelect,
  selectedId,
}: {
  data: ManagementData;
  onSelect: (id: string) => void;
  selectedId: string;
}): ReactElement {
  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === selectedId);

  return (
    <div className={`resource-workspace ${selectedVehicle ? 'has-selection' : 'is-idle'}`} aria-label="차량 관리">
      <section className="page-panel management-list-panel" aria-label="차량 리스트">
        <AdminSectionHeader title="차량 리스트" side={<span className="section-meta">{data.vehicles.length}대</span>} />
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
        <AdminSectionHeader
          title="차량 상세"
          side={selectedVehicle ? <SelectionClearButton onClick={() => onSelect(selectedVehicle.id)} /> : null}
        />
        {selectedVehicle ? (
          <dl className="management-detail">
            <div><dt>차량 번호</dt><dd>{selectedVehicle.plate || '-'}</dd></div>
            <div><dt>차종</dt><dd>{selectedVehicle.type || '-'}</dd></div>
            <div><dt>배정 배송원</dt><dd>{assignedDrivers(data, selectedVehicle.id)}</dd></div>
            <div><dt>TMS 일련번호</dt><dd>{selectedVehicle.telematicsSerialNumber || '-'}</dd></div>
          </dl>
        ) : <EmptyState label="차량을 선택하면 상세 정보를 확인할 수 있습니다." />}
      </section>
    </div>
  );
}

function SelectionClearButton({ onClick }: { onClick: () => void }): ReactElement {
  return (
    <span className="management-actions">
      <button type="button" onClick={onClick}>선택 취소</button>
    </span>
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
  const vehicleIds = data.assignments.filter((assignment) => assignment.driverId === driverId).map((assignment) => assignment.vehicleId);
  const labels = data.vehicles.filter((vehicle) => vehicleIds.includes(vehicle.id)).map((vehicle) => vehicle.plate || vehicle.type);
  return labels.join(', ') || '-';
}

function assignedDrivers(data: ManagementData, vehicleId: string): string {
  const driverIds = data.assignments.filter((assignment) => assignment.vehicleId === vehicleId).map((assignment) => assignment.driverId);
  const labels = data.drivers.filter((driver) => driverIds.includes(driver.id)).map((driver) => driver.name);
  return labels.join(', ') || '-';
}
