import type { DispatchImportView } from '../services/dispatch-imports';

const lastDispatchImportKey = 'clever.dispatch.last-import';

export function saveLastDispatchImport(dispatchImport: DispatchImportView): void {
  window.localStorage.setItem(lastDispatchImportKey, JSON.stringify(dispatchImport));
}
