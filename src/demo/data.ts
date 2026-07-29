import type { DevDb } from './model';

export const demoCustomerId = 'customer-dsv';
export const demoOrderKey = 'DSV-2026-0709-01';

export function demoDeliveryDate(dayOffset = 0): string {
  return new Date(Date.now() + (9 * 60 + dayOffset * 24 * 60) * 60_000).toISOString().slice(0, 10);
}

// The local projection intentionally starts empty. Fixed dispatch workbook imports
// will become the only source of customers, destinations, orders, people, and vehicles.
export const devDb: DevDb = {
  customers: [],
  customerUsers: [],
  vehicles: [],
  drivers: [],
  orders: [],
  orderItems: [],
  deliveryStops: [],
  routePlanStops: [],
  proofMedia: [],
};
