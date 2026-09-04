import type { FormEvent, ReactElement, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function DispatchDriverRegistrationDialog({
  busy,
  error,
  name,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string;
  name: string;
  onClose: () => void;
  onSubmit: (phone: string) => void;
}): ReactElement {
  const dialogRef = useModalDialog();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget).get('phone')?.toString() ?? '');
  };
  return (
    <dialog aria-labelledby="dispatch-driver-registration-title" className="driver-invite-dialog dispatch-resource-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }} ref={dialogRef}>
      <form onSubmit={submit}>
        <DialogHeader description="파일에 입력된 이름으로 배송원을 등록합니다." id="dispatch-driver-registration-title" onClose={onClose} title="배송원 등록" />
        <div className="dispatch-resource-dialog-body">
          <label>이름<input name="name" readOnly value={name} /></label>
          <label>연락처<input name="phone" maxLength={40} placeholder="선택 입력" /></label>
          {error ? <p role="alert">{error}</p> : null}
        </div>
        <DialogFooter busy={busy} onClose={onClose} submitLabel="저장" />
      </form>
    </dialog>
  );
}

export function DispatchVehicleAssignmentDialog({
  busy,
  driverName,
  error,
  expectedVehiclePlate,
  onClose,
  onSubmit,
  vehicles,
}: {
  busy: boolean;
  driverName: string;
  error: string;
  expectedVehiclePlate: string;
  onClose: () => void;
  onSubmit: (vehicleId: string) => void;
  vehicles: Array<{ id: string; plate: string }>;
}): ReactElement {
  const dialogRef = useModalDialog();
  const expectedVehicle = vehicles.find((vehicle) => vehicle.plate === expectedVehiclePlate);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const vehicleId = new FormData(event.currentTarget).get('vehicleId')?.toString() ?? '';
    if (vehicleId !== '') onSubmit(vehicleId);
  };
  return (
    <dialog aria-labelledby="dispatch-vehicle-assignment-title" className="driver-invite-dialog dispatch-resource-dialog" onCancel={(event) => { event.preventDefault(); onClose(); }} ref={dialogRef}>
      <form onSubmit={submit}>
        <DialogHeader description="배송원에게 차량을 배정한 뒤 업로드를 다시 검사합니다." id="dispatch-vehicle-assignment-title" onClose={onClose} title="차량 배정" />
        <div className="dispatch-resource-dialog-body">
          <label>배송원<input readOnly value={driverName} /></label>
          <label>차량
            <select aria-label="배정할 차량" defaultValue={expectedVehicle?.id ?? ''} name="vehicleId" required>
              <option value="">차량 선택</option>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate}</option>)}
            </select>
          </label>
          {expectedVehiclePlate && expectedVehicle === undefined ? <p role="alert">파일의 차량 번호를 먼저 등록하거나 기존 차량 배정을 확인하세요: {expectedVehiclePlate}</p> : null}
          {!expectedVehiclePlate && vehicles.length === 0 ? <p role="alert">배정할 수 있는 미배정 차량이 없습니다.</p> : null}
          {error ? <p role="alert">{error}</p> : null}
        </div>
        <DialogFooter busy={busy || vehicles.length === 0 || (expectedVehiclePlate !== '' && expectedVehicle === undefined)} onClose={onClose} submitLabel="배정" />
      </form>
    </dialog>
  );
}

function DialogHeader({ description, id, onClose, title }: { description: string; id: string; onClose: () => void; title: string }): ReactElement {
  return (
    <header className="driver-invite-header">
      <span><strong id={id}>{title}</strong><small>{description}</small></span>
      <button aria-label={`${title} 닫기`} type="button" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
  );
}

function DialogFooter({ busy, onClose, submitLabel }: { busy: boolean; onClose: () => void; submitLabel: string }): ReactElement {
  return (
    <footer className="driver-invite-footer">
      <button disabled={busy} type="button" onClick={onClose}>취소</button>
      <button className="primary" disabled={busy} type="submit">{busy ? '저장 중' : submitLabel}</button>
    </footer>
  );
}

function useModalDialog(): RefObject<HTMLDialogElement | null> {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  return dialogRef;
}
