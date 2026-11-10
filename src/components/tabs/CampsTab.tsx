'use client';
// Relief camps by priority (fn_calculate_camp_urgency_score), shortfall (v_camp_deficit_matrix), new request / camp forms
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)

import { useState } from 'react';
import { Building2, ClipboardList, Layers, Plus } from 'lucide-react';
import { useApi, useSession } from '@/lib/client/session';
import { useToast } from '@/lib/client/toast';
import { can } from '@/lib/permissions';
import { Async, Badge, Field, fmt, humanize, num, Panel, Progress, Table } from '../ui';

const URGENCIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const CAMP_TYPES = ['TEMPORARY_SHELTER', 'FIELD_HOSPITAL', 'TRANSIT_CAMP', 'DISTRIBUTION_HUB'];

export default function CampsTab({ zones }: { zones: any[] }) {
  const { api, refresh, user } = useSession();
  const notify = useToast();
  const camps = useApi('/api/camps');
  const inv = useApi(can(user?.role, 'createRequest') ? '/api/inventory' : null);
  const campRows: any[] = camps.data?.camps ?? [];
  const deficits: any[] = camps.data?.deficits ?? [];
  const categories: any[] = inv.data?.categories ?? [];

  const [req, setReq] = useState({ campId: '', categoryId: '', requestedQuantity: 100, urgencyLevel: 'HIGH', notes: '' });
  const [camp, setCamp] = useState({ zoneId: 1, name: '', campType: 'TEMPORARY_SHELTER', contactPerson: '', contactPhone: '', capacity: 500, currentOccupancy: 0 });
  const [busy, setBusy] = useState(false);

  async function post(path: string, body: unknown, success: string, reset: () => void) {
    setBusy(true);
    try {
      await api(path, { method: 'POST', body });
      notify(success, 'success');
      reset();
      refresh();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Panel
        accent
        icon={<Building2 size={20} className="c-cyan" />}
        title="All relief camps"
        subtitle="Priority (0–100) is based on how full the camp is, how severe the disaster is, and its urgent requests and calls"
      >
        <Async loading={camps.loading} error={camps.error} empty={!campRows.length}>
          <Table head={['Camp', 'Type', 'Area', 'Contact', 'People / capacity', 'Occupancy', 'Status', 'Priority']}>
            {campRows.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{humanize(c.camp_type)}</td>
                <td>{c.zone_name}<div className="sub">{humanize(c.severity_level)} severity</div></td>
                <td>{c.contact_person}<div className="sub">{c.contact_phone}</div></td>
                <td className="num">{fmt(c.current_occupancy)} / {fmt(c.capacity)}</td>
                <td><Progress pct={c.occupancy_pct} /></td>
                <td><Badge value={c.status} /></td>
                <td><Badge tone={num(c.urgency_score) >= 70 ? 'critical' : num(c.urgency_score) >= 50 ? 'high' : 'medium'}>{num(c.urgency_score).toFixed(0)}</Badge></td>
              </tr>
            ))}
          </Table>
        </Async>
      </Panel>

      <Panel icon={<Layers size={18} className="c-amber" />} title="Supply shortfall by camp" subtitle="What each camp asked for, what has reached them, and what is still missing">
        <Table head={['Camp', 'Item', 'Requested', 'Approved', 'On the way', 'Delivered', 'Still needed']} empty={!deficits.length}>
          {deficits.map((d) => (
            <tr key={`${d.camp_id}-${d.category_id}`}>
              <td><strong>{d.camp_name}</strong><div className="sub">{d.zone_name}</div></td>
              <td>{d.resource_name}<div className="sub">{humanize(d.category_group)}</div></td>
              <td className="num">{fmt(d.total_requested)}</td>
              <td className="num">{fmt(d.total_approved)}</td>
              <td className="num">{fmt(d.in_transit)}</td>
              <td className="num">{fmt(d.total_delivered)}</td>
              <td className={`num ${num(d.unfulfilled_deficit) > 0 ? 'c-rose' : 'c-emerald'}`}><strong>{fmt(d.unfulfilled_deficit)}</strong> {d.unit_of_measure}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <div className="grid-2">
        {can(user?.role, 'createRequest') && (
          <Panel icon={<ClipboardList size={18} className="c-cyan" />} title="Request supplies for a camp" subtitle="The request appears immediately in Supplies & Shipments">
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                post('/api/requests', { ...req, campId: Number(req.campId), categoryId: Number(req.categoryId) }, 'Supply request submitted.', () =>
                  setReq({ ...req, notes: '' })
                );
              }}
            >
              <div className="form-grid">
                <Field label="Camp *">
                  <select className="select" required value={req.campId} onChange={(e) => setReq({ ...req, campId: e.target.value })}>
                    <option value="">Select a camp</option>
                    {campRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Item *">
                  <select className="select" required value={req.categoryId} onChange={(e) => setReq({ ...req, categoryId: e.target.value })}>
                    <option value="">Select an item</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Quantity *">
                  <input className="input" type="number" min={1} required value={req.requestedQuantity} onChange={(e) => setReq({ ...req, requestedQuantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                </Field>
                <Field label="Priority">
                  <select className="select" value={req.urgencyLevel} onChange={(e) => setReq({ ...req, urgencyLevel: e.target.value })}>
                    {URGENCIES.map((u) => <option key={u} value={u}>{humanize(u)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Notes">
                <input className="input" maxLength={1000} value={req.notes} onChange={(e) => setReq({ ...req, notes: e.target.value })} placeholder="Why is this needed?" />
              </Field>
              <button className="btn btn-primary" disabled={busy}><Plus size={16} /> Submit request</button>
            </form>
          </Panel>
        )}

        {can(user?.role, 'createCamp') && (
          <Panel icon={<Building2 size={18} className="c-emerald" />} title="Register a new camp" subtitle="Location defaults to the centre of the selected area">
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                post('/api/camps', camp, `Camp “${camp.name}” registered.`, () => setCamp({ ...camp, name: '', contactPerson: '', contactPhone: '' }));
              }}
            >
              <div className="form-grid">
                <Field label="Camp name *">
                  <input className="input" required maxLength={150} value={camp.name} onChange={(e) => setCamp({ ...camp, name: e.target.value })} />
                </Field>
                <Field label="Area">
                  <select className="select" value={camp.zoneId} onChange={(e) => setCamp({ ...camp, zoneId: Number(e.target.value) })}>
                    {zones.map((z) => <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select className="select" value={camp.campType} onChange={(e) => setCamp({ ...camp, campType: e.target.value })}>
                    {CAMP_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
                  </select>
                </Field>
                <Field label="Contact person *">
                  <input className="input" required maxLength={100} value={camp.contactPerson} onChange={(e) => setCamp({ ...camp, contactPerson: e.target.value })} />
                </Field>
                <Field label="Contact phone *">
                  <input className="input" required maxLength={20} value={camp.contactPhone} onChange={(e) => setCamp({ ...camp, contactPhone: e.target.value })} />
                </Field>
                <Field label="Capacity *">
                  <input className="input" type="number" min={1} required value={camp.capacity} onChange={(e) => setCamp({ ...camp, capacity: Math.max(1, parseInt(e.target.value) || 1) })} />
                </Field>
                <Field label="Current occupancy">
                  <input className="input" type="number" min={0} value={camp.currentOccupancy} onChange={(e) => setCamp({ ...camp, currentOccupancy: Math.max(0, parseInt(e.target.value) || 0) })} />
                </Field>
              </div>
              <button className="btn btn-primary" disabled={busy}><Plus size={16} /> Register camp</button>
            </form>
          </Panel>
        )}
      </div>
    </div>
  );
}
