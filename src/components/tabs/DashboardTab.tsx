'use client';
// Overview: affected areas (view v_active_disaster_dashboard), open demand, recent activity (allocation_audit_log)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)

import { AlertTriangle, ChevronRight, Layers, ShieldAlert } from 'lucide-react';
import { useSession } from '@/lib/client/session';
import { can } from '@/lib/permissions';
import { Async, Badge, fmt, fmtTime, humanize, num, Panel, Progress, Table } from '../ui';
import type { Navigate } from '../App';

const ACTION_LABEL: Record<string, string> = {
  DISPATCH_ALLOCATION: 'Supplies sent',
  DELIVERY: 'Delivery confirmed',
  DELIVERY_FAILED: 'Delivery failed',
  STOCK_ADJUSTMENT: 'Stock added',
  INSERT: 'New record added',
  UPDATE: 'Record updated',
  DELETE: 'Record removed',
};

const AUDIT_BAR: Record<string, string> = {
  DISPATCH_ALLOCATION: 'bar-emerald',
  DELIVERY: 'bar-emerald',
  DELIVERY_FAILED: 'bar-rose',
  STOCK_ADJUSTMENT: 'bar-indigo',
};

function describeAudit(a: any): string {
  const n = a.new_state ?? {};
  const o = a.old_state ?? {};
  switch (a.action_type) {
    case 'DISPATCH_ALLOCATION':
      return `Shipment ${n.tracking_code} sent with ${n.allocated_qty} units (${n.distance_km} km). Warehouse stock ${o.available_stock_before} → ${n.remaining_stock}.`;
    case 'DELIVERY':
      return `Shipment ${n.tracking_code} delivered.`;
    case 'DELIVERY_FAILED':
      return `Shipment ${n.tracking_code} could not be delivered — stock returned to the warehouse.`;
    case 'STOCK_ADJUSTMENT':
      return `${n.restocked} units added to stock (now ${n.available_quantity}).`;
    default:
      return o.status ? `Status changed from ${humanize(o.status).toLowerCase()} to ${humanize(n.status).toLowerCase()}.` : 'Record updated.';
  }
}

export default function DashboardTab({ data, loading, error, navigate }: { data: any; loading: boolean; error: string | null; navigate: Navigate }) {
  const { user } = useSession();
  const zones: any[] = data?.disasterZones ?? [];
  const critical: any[] = data?.criticalRequests ?? [];
  const audit: any[] = data?.recentAudit ?? [];
  const canDispatch = can(user?.role, 'dispatch');

  return (
    <div className="stack">
      <Panel
        accent
        icon={<ShieldAlert size={20} className="c-rose" />}
        title="Affected areas"
        subtitle="Summary of each disaster-affected area"
      >
        <Async loading={loading} error={error} empty={!zones.length}>
          <Table head={['Area', 'Disaster', 'Severity', 'Camps', 'Capacity', 'People sheltered', 'Camp occupancy', 'Urgent requests', 'Open calls']}>
            {zones.map((z) => (
              <tr key={z.zone_id}>
                <td><strong>{z.zone_name}</strong><div className="sub">{fmt(z.estimated_affected_pop)} people affected</div></td>
                <td><Badge tone="medium" value={z.disaster_type} /></td>
                <td><Badge value={z.severity_level} /></td>
                <td className="num">{z.total_camps}</td>
                <td className="num">{fmt(z.total_shelter_capacity)}</td>
                <td className="num">{fmt(z.total_sheltered_victims)}</td>
                <td><Progress pct={z.shelter_utilization_pct} /></td>
                <td>{num(z.critical_requests_count) > 0 ? <Badge tone="critical">{z.critical_requests_count} urgent</Badge> : <Badge tone="success">None</Badge>}</td>
                <td><Badge tone={num(z.unresolved_sos_count) ? 'high' : 'success'}>{z.unresolved_sos_count}</Badge></td>
              </tr>
            ))}
          </Table>
        </Async>
      </Panel>

      <div className="grid-2">
        <Panel
          icon={<AlertTriangle size={18} className="c-amber" />}
          title="Urgent supply requests"
          subtitle="Requests from camps that are still waiting for supplies"
          actions={canDispatch && <button className="btn btn-primary btn-sm" onClick={() => navigate('dispatch')}>Send supplies <ChevronRight size={14} /></button>}
        >
          <Table head={['Camp', 'Item', 'Still needed', 'Priority', '']} empty={!critical.length} emptyText="No open requests — every camp is supplied.">
            {critical.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.camp_name}</strong><div className="sub">{r.zone_name}</div></td>
                <td className="c-sky">{r.resource_name}</td>
                <td className="num">{fmt(num(r.requested_quantity) - num(r.approved_quantity))}</td>
                <td><Badge value={r.urgency_level} /></td>
                <td>{canDispatch && <button className="btn btn-secondary btn-sm" onClick={() => navigate('dispatch', { requestId: r.id })}>Dispatch</button>}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel
          icon={<Layers size={18} className="c-indigo" />}
          title="Recent activity"
          subtitle="Latest actions recorded in the system"
        >
          <div className="stack-sm scroll-y">
            {audit.length === 0 && <div className="empty">No activity yet.</div>}
            {audit.map((a) => (
              <div key={a.id} className={`item bar-left ${AUDIT_BAR[a.action_type] ?? ''}`}>
                <div className="row-between">
                  <span className="strong small">{ACTION_LABEL[a.action_type] ?? humanize(a.action_type)}</span>
                  <span className="tiny muted">{fmtTime(a.timestamp)}</span>
                </div>
                <span className="small soft">{describeAudit(a)}</span>
                <span className="tiny dim">by {a.performed_by_name ?? 'system'}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
