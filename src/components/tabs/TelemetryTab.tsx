'use client';
// Field reports: drone survey summary (MongoDB aggregation pipeline) + incident feed (incident_event_feed)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)

import { useState } from 'react';
import { Compass, Radio, Send } from 'lucide-react';
import { useApi, useSession } from '@/lib/client/session';
import { useToast } from '@/lib/client/toast';
import { can } from '@/lib/permissions';
import { Async, Badge, Field, fmtDateTime, humanize, Panel } from '../ui';

const WINDOWS = [
  { value: '24', label: 'Last 24 h' },
  { value: '168', label: 'Last 7 days' },
  { value: 'all', label: 'All time' },
];
const CATEGORIES = ['WEATHER_ALERT', 'INFRASTRUCTURE_FAILURE', 'ACCESS_RESTRICTION', 'MEDICAL_EMERGENCY', 'RESCUE_OPERATION', 'OTHER'];

export default function TelemetryTab({ zones }: { zones: any[] }) {
  const { api, refresh, user } = useSession();
  const notify = useToast();
  const [windowSel, setWindowSel] = useState('24');
  const tel = useApi(`/api/telemetry?window=${windowSel}`);
  const agg: any[] = tel.data?.aggregationPipeline?.data ?? [];
  const incidents: any[] = tel.data?.incidents ?? [];

  const [form, setForm] = useState({ zoneId: 1, category: 'ACCESS_RESTRICTION', severity: 'HIGH', headline: '' });
  const [busy, setBusy] = useState(false);

  async function report(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api('/api/telemetry', { method: 'POST', body: form });
      notify(`Incident report ${data.incident.event_code} saved.`, 'success');
      setForm({ ...form, headline: '' });
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
        icon={<Compass size={18} className="c-cyan" />}
        title="Drone survey summary"
        subtitle="Damage observed by survey drones in each area"
        actions={
          <>
            {WINDOWS.map((w) => (
              <button key={w.value} className={`btn btn-chip${windowSel === w.value ? ' active' : ''}`} onClick={() => setWindowSel(w.value)}>{w.label}</button>
            ))}
          </>
        }
      >
        <div className="stack-sm">
          <Async loading={tel.loading} error={tel.error} empty={!agg.length}
            emptyText="No drone surveys in this period. Try a longer period.">
            <div className="grid-cards">
              {agg.map((a) => (
                <div key={a.zone_id} className="item">
                  <div className="row-between">
                    <h4>{a.zone_name}</h4>
                    <Badge tone={a.avg_hazard_score >= 8 ? 'critical' : 'high'}>Hazard {a.avg_hazard_score}/10</Badge>
                  </div>
                  <div className="stat-grid">
                    <div className="stat"><div className="stat-label">Drone flights</div><div className="stat-value">{a.total_missions}</div></div>
                    <div className="stat"><div className="stat-label">Survivors spotted</div><div className="stat-value c-emerald">{a.total_thermal_survivors}</div></div>
                    <div className="stat"><div className="stat-label">Flooded buildings</div><div className="stat-value c-rose">{a.total_submerged_structures}</div></div>
                    <div className="stat"><div className="stat-label">Roads blocked</div><div className="stat-value c-amber">{a.impassable_roads}/{a.blockage_count}</div></div>
                  </div>
                  <span className="tiny muted">Highest hazard {a.max_hazard_score}/10 · last flight {fmtDateTime(a.latest_flight)}</span>
                </div>
              ))}
            </div>
          </Async>
        </div>
      </Panel>

      <div className="grid-2">
        <Panel icon={<Radio size={18} className="c-amber" />} title="Incident reports" subtitle="Reports received from radio, sensors and field teams">
          <div className="stack-sm scroll-y">
            {incidents.length === 0 && <div className="empty">No incidents recorded.</div>}
            {incidents.map((i) => (
              <div key={String(i._id)} className={`item bar-left ${i.severity === 'CRITICAL' ? 'bar-rose' : 'bar-amber'}`}>
                <div className="row-between">
                  <span className="strong small">{i.headline}</span>
                  <Badge value={i.severity} />
                </div>
                <span className="tiny muted">
                  Ref. {i.event_code} · {humanize(i.category)} · {humanize(i.source)}{i.reported_by ? ` · ${i.reported_by.name}` : ''} · {fmtDateTime(i.created_at)} · {i.verified ? 'Verified' : 'Not yet verified'}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <div className="stack">
          {can(user?.role, 'reportIncident') && (
            <Panel icon={<Send size={18} className="c-cyan" />} title="Report an incident" subtitle="Send a report from the field">
              <form className="form" onSubmit={report}>
                <div className="form-grid">
                  <Field label="Area">
                    <select className="select" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: Number(e.target.value) })}>
                      {zones.map((z) => <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>)}
                    </select>
                  </Field>
                  <Field label="Category">
                    <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
                    </select>
                  </Field>
                  <Field label="Severity">
                    <select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                      {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="What happened? *">
                  <input className="input" required maxLength={300} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. Bridge on NH-48 washed out" />
                </Field>
                <button className="btn btn-primary" disabled={busy}><Send size={16} /> Submit report</button>
              </form>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
