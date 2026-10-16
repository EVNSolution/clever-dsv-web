/**
 * The time the vehicle arrived at its last stop. The route ends there: DSV vehicles do not have to return to the
 * center. A stop counts as reached by its arrival event, or by a delivered or failed event when no arrival was
 * recorded. Undefined while any stop is not reached yet, so a vehicle still on its way has no end.
 */
export function lastStopArrivedMs(
  orders: ReadonlyArray<{ eventSummary: ReadonlyArray<{ occurredAt: string; type: string }> }>,
): number | undefined {
  let last: number | undefined;
  for (const order of orders) {
    const earliest = (types: readonly string[]): number | undefined => {
      let found: number | undefined;
      for (const event of order.eventSummary) {
        if (!types.includes(event.type)) continue;
        const time = Date.parse(event.occurredAt);
        if (Number.isFinite(time) && (found === undefined || time < found)) found = time;
      }
      return found;
    };
    const reached = earliest(['STOP_ARRIVED']) ?? earliest(['STOP_DELIVERED', 'STOP_FAILED']);
    if (reached === undefined) return undefined;
    if (last === undefined || reached > last) last = reached;
  }
  return last;
}

/**
 * When each vehicle finished its route, as an ISO time: the arrival at its last stop. A vehicle with a stop not
 * reached yet is absent, so a vehicle on its way is never listed as finished.
 */
export function vehicleRouteCompletions(
  orders: ReadonlyArray<{
    assignmentStatus: string;
    eventSummary: ReadonlyArray<{ occurredAt: string; type: string }>;
    vehicleId: string | null;
  }>,
): Map<string, string> {
  const byVehicle = new Map<string, typeof orders[number][]>();
  for (const order of orders) {
    if (order.assignmentStatus !== 'ASSIGNED' || order.vehicleId === null) continue;
    byVehicle.set(order.vehicleId, [...(byVehicle.get(order.vehicleId) ?? []), order]);
  }
  const completions = new Map<string, string>();
  for (const [vehicleId, vehicleOrders] of byVehicle) {
    const finishedMs = lastStopArrivedMs(vehicleOrders);
    if (finishedMs !== undefined) completions.set(vehicleId, new Date(finishedMs).toISOString());
  }
  return completions;
}
