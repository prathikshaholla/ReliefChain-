'use client';
// Supplies & shipments: dispatch form (stored procedure sp_process_resource_dispatch) + shipment tracking (trigger trg_shipment_delivery)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Navigation, Truck, XCircle } from 'lucide-react';
import { useApi, useSession } from '@/lib/client/session';
import { useToast } from '@/lib/client/toast';
import { can, ROLE_LABELS } from '@/lib/permissions';
import { Async, Badge, Field, fmt, fmtDateTime, humanize, num, Panel, Table } from '../ui';

const OPEN = ['PENDING', 'APPROVED', 'PARTIALLY_FULFILLED'];

export default function DispatchTab({ preselectRequest }: { preselectRequest?: number }) {
  const { api, refresh, user } = useSession();
  const notify = useToast();
  const requests = useApi('/api/requests');
  const dispatch = useApi('/api/dispatch');

  const [requestId, setRequestId] = useState<string>(preselectRequest ? String(preselectRequest) : '');
  const [warehouseId, setWarehouseId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const nearest = useApi(requestId ? `/api/dispatch?requestId=${requestId}` : null);

  const openRequests: any[] = (requests.data?.requests ?? []).filter((r: any) => OPEN.includes(r.status));
  const selected = openRequests.find((r) => String(r.id) === requestId);
  const depots: any[] = requestId ? nearest.data?.nearestWarehouses ?? [] : [];
  const fleet: any[] = dispatch.data?.fleet ?? [];
  const available = fleet.filter((v) => v.status === 'AVAILABLE');
  const shipments: any[] = dispatch.data?.shipments ?? [];
  const canDispatch = can(user?.role, 'dispatch');

  // When the request changes: default qty to what's still needed, depot to the nearest one
  useEffect(() => {
    if (selected) setQty(num(selected.remaining_quantity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, selected?.remaining_quantity]);
  useEffect(() => {
    const firstWithStock = depots.find((d) => num(d.available_stock) >= qty) ?? depots[0];
    setWarehouseId(firstWithStock ? String(firstWithStock.warehouse_id) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearest.data]);

  const depot = depots.find((d) => String(d.warehouse_id) === warehouseId);
  const vehicle = available.find((v) => String(v.vehicle_id) === vehicleId);
  const weightKg = selected ? qty * num(selected.weight_kg_per_unit) : 0;
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (selected && qty > num(selected.remaining_quantity)) w.push(`Only ${selected.remaining_quantity} units are still needed.`);
    if (depot && qty > num(depot.available_stock)) w.push(`${depot.warehouse_name} only has ${depot.available_stock} units.`);
    if (vehicle && weightKg > num(vehicle.max_payload_kg)) w.push(`Load is ${fmt(weightKg)} kg but ${vehicle.vehicle_number} carries ${fmt(vehicle.max_payload_kg)} kg.`);
    return w;
  }, [selected, depot, vehicle, qty, weightKg]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api('/api/dispatch', {
        method: 'POST',
        body: { requestId: Number(requestId), warehouseId: Number(warehouseId), vehicleId: Number(vehicleId), allocatedQty: qty },
      });
      setLastResult(data);
      notify(`Dispatch confirmed. Tracking number: ${data.trackingCode}.`, 'success');
      setRequestId('');
      setVehicleId('');
      refresh();
    } catch (err) {
      // The stored procedure's RAISE EXCEPTION message lands here; nothing was changed (ROLLBACK).
      notify(`Dispatch not completed, nothing was changed — ${(err as Error).message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: number, status: 'DELIVERED' | 'FAILED') {
    try {
      const data = await api(`/api/dispatch/${id}/status`, { method: 'POST', body: { status } });
      notify(data.message, status === 'DELIVERED' ? 'success' : 'info');
      refresh();
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  }

  return (
    <div className="stack">
      <Panel
        accent
        icon={<Navigation size={18} className="c-cyan" />}
        title="Send supplies"
        subtitle="Stock is reserved and the vehicle is assigned together — if any check fails, nothing is changed."
      >
        {!canDispatch ? (
          <div className="alert alert-info">As a {ROLE_LABELS[user!.role]} you can track shipments and confirm deliveries below. Sending supplies is done by the Logistics Officer or Relief Coordinator.</div>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="form-grid">
              <Field label="1. Supply request *">
                <select className="select" required value={requestId} onChange={(e) => setRequestId(e.target.value)}>
                  <option value="">Select a request</option>
                  {openRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.camp_name} — {r.resource_name} × {r.remaining_quantity} ({humanize(r.urgency_level)})
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="2. From warehouse (nearest first) *"
                hint={depots[0] && `Nearest: ${depots[0].warehouse_name} (${depots[0].distance_km} km)`}
              >
                <select className="select" required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={!requestId}>
                  <option value="">{requestId ? (nearest.loading ? 'Finding nearest warehouses…' : depots.length ? 'Select a warehouse' : 'No warehouse has this item') : 'Select a request first'}</option>
                  {depots.map((d) => (
                    <option key={d.warehouse_id} value={d.warehouse_id}>
                      {d.warehouse_name} — {d.distance_km} km away, {d.available_stock} in stock
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="3. Vehicle *" hint={selected && `Estimated load: ${fmt(weightKg)} kg`}>
                <select className="select" required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                  <option value="">Select an available vehicle</option>
                  {available.map((v) => (
                    <option key={v.vehicle_id} value={v.vehicle_id}>
                      {v.vehicle_number} — {humanize(v.vehicle_type)} (up to {fmt(v.max_payload_kg)} kg)
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="4. Quantity (units) *">
                <input className="input" type="number" min={1} required value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
              </Field>
            </div>

            {warnings.length > 0 && (
              <div className="alert alert-warn">
                <div>
                  {warnings.map((w) => <div key={w}>{w}</div>)}
                  <div className="tiny">If you submit anyway, the dispatch will be refused and nothing will change.</div>
                </div>
              </div>
            )}

            <div className="row">
              <button className="btn btn-primary" disabled={busy}><Truck size={16} /> {busy ? 'Processing…' : 'Confirm dispatch'}</button>
            </div>

            {lastResult && (
              <div className="alert alert-success">
                Dispatch confirmed. Tracking number <strong>{lastResult.trackingCode}</strong> · {lastResult.shipment.route_distance_km} km · expected {fmtDateTime(lastResult.shipment.estimated_arrival)}
              </div>
            )}
          </form>
        )}
      </Panel>

      <Panel icon={<Truck size={18} className="c-blue" />} title="Shipments" subtitle="Confirm delivery once a shipment reaches the camp — the vehicle is then freed and the request updated.">
        <Async loading={dispatch.loading} error={dispatch.error} empty={!shipments.length} emptyText="No shipments yet.">
          <Table head={['Tracking no.', 'To camp', 'Items', 'From', 'Vehicle', 'Distance', 'Expected / arrived', 'Status', '']}>
            {shipments.map((s) => {
              const open = !['DELIVERED', 'FAILED'].includes(s.delivery_status);
              return (
                <tr key={s.id}>
                  <td><strong className="mono">{s.tracking_code}</strong><div className="sub">by {s.dispatched_by_name ?? '—'}</div></td>
                  <td>{s.destination_camp}</td>
                  <td>{s.item_name}<div className="sub">{fmt(s.quantity_loaded)} {s.unit_of_measure}</div></td>
                  <td>{s.warehouse_name}</td>
                  <td>{s.vehicle_number}<div className="sub">{humanize(s.vehicle_type)}</div></td>
                  <td className="num">{s.route_distance_km} km</td>
                  <td className="small">{fmtDateTime(s.actual_arrival ?? s.estimated_arrival)}</td>
                  <td><Badge value={s.delivery_status} /></td>
                  <td>
                    {open && (
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        {can(user?.role, 'confirmDelivery') && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setStatus(s.id, 'DELIVERED')}><CheckCircle2 size={14} className="c-emerald" /> Mark delivered</button>
                        )}
                        {can(user?.role, 'failShipment') && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setStatus(s.id, 'FAILED')} title="Mark as failed and return stock to the warehouse"><XCircle size={14} className="c-rose" /> Failed</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Async>
      </Panel>

      <Panel icon={<Truck size={18} className="c-emerald" />} title="Vehicles" subtitle="All vehicles and whether they are free">
        <Table head={['Vehicle', 'Type', 'Carries up to', 'Based at', 'Status', 'Current shipment']} empty={!fleet.length}>
          {fleet.map((v) => (
            <tr key={v.vehicle_id}>
              <td className="mono">{v.vehicle_number}</td>
              <td>{humanize(v.vehicle_type)}</td>
              <td className="num">{fmt(v.max_payload_kg)} kg</td>
              <td>{v.home_warehouse_name}</td>
              <td><Badge value={v.status} /></td>
              <td className="mono small">{v.active_mission_code ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}
