'use client';
// Emergency calls: SOS ingestion (pgvector embedding) + semantic search over stored calls
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)

import { useState } from 'react';
import { Radio, Search, Send, Siren } from 'lucide-react';
import { useApi, useSession } from '@/lib/client/session';
import { useToast } from '@/lib/client/toast';
import { Async, Badge, Field, fmtDateTime, humanize, num, Panel } from '../ui';

const EXAMPLES = ['infant baby formula and clean water', 'insulin for diabetic elderly', 'bandages and splints for fractures', 'cold night, need blankets and tents'];
const EMPTY_FORM = { senderName: '', senderPhone: '', victimCount: 1, zoneId: 1, message: '' };

export default function SosTab({ zones }: { zones: any[] }) {
  const { api, refresh } = useSession();
  const notify = useToast();
  const sos = useApi('/api/sos');
  const signals: any[] = sos.data?.signals ?? [];

  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await api('/api/sos', { method: 'POST', body: form });
      setAnalysis(data.semanticAnalysis);
      setForm(EMPTY_FORM);
      notify(`Emergency call recorded. Priority: ${humanize(data.semanticAnalysis.detectedUrgency)}.`, 'success');
      refresh();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function search(text = q) {
    if (!text.trim()) return;
    setQ(text);
    setSearching(true);
    try {
      setResults(await api('/api/semantic-search', { method: 'POST', body: { queryText: text, limit: 5 } }));
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="stack">
      <Panel
        accent
        icon={<Search size={18} className="c-cyan" />}
        title="Find similar calls"
        subtitle="Search by meaning, not just exact words — e.g. “insulin for elderly” also finds “diabetic medicine”."
      >
        <div className="stack-sm">
          <div className="row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 260 }}
              placeholder="Describe what you are looking for…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <button className="btn btn-primary" onClick={() => search()} disabled={searching || !q.trim()}>
              <Search size={16} /> {searching ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="row">
            <span className="tiny muted">Try:</span>
            {EXAMPLES.map((ex) => <button key={ex} className="btn btn-chip" onClick={() => search(ex)}>{ex}</button>)}
          </div>

          {results && (
            <div className="inset stack-sm">
              <div className="row-between">
                <span className="small strong">Calls similar to “{results.queryText}”</span>
                <div className="row">
                  <span className="tiny muted">Suggested supplies:</span>
                  {results.recommendedReliefKits.slice(0, 3).map((k: any) => <Badge key={k.categoryId} tone="success">{k.categoryName ?? k.categoryCode}</Badge>)}
                  {results.recommendedReliefKits.length === 0 && <span className="tiny dim">none</span>}
                </div>
              </div>
              <div className="grid-cards">
                {results.matchedSignals.map((m: any) => (
                  <div key={m.id} className={`item bar-left ${num(m.cosine_similarity) >= 0.5 ? 'bar-emerald' : 'bar-amber'}`}>
                    <div className="row-between">
                      <span className="strong small">{m.sender_name}</span>
                      <Badge tone={num(m.cosine_similarity) >= 0.5 ? 'success' : 'high'}>{(num(m.cosine_similarity) * 100).toFixed(0)}% match</Badge>
                    </div>
                    <p className="small soft">“{m.raw_message}”</p>
                    <span className="tiny muted">Suggested supplies: <strong>{m.matched_category_name ?? '—'}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid-2">
        <Panel icon={<Send size={18} className="c-cyan" />} title="Record a new emergency call" subtitle="The message is read automatically to set a priority and suggest the supplies needed">
          <form className="form" onSubmit={submit}>
            <div className="form-grid">
              <Field label="Caller name *">
                <input className="input" required maxLength={100} value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} placeholder="e.g. Ramesh Varma" />
              </Field>
              <Field label="Phone number">
                <input className="input" maxLength={30} value={form.senderPhone} onChange={(e) => setForm({ ...form, senderPhone: e.target.value })} placeholder="+91-98765 43210" />
              </Field>
              <Field label="People needing help *">
                <input className="input" type="number" min={1} required value={form.victimCount} onChange={(e) => setForm({ ...form, victimCount: Math.max(1, parseInt(e.target.value) || 1) })} />
              </Field>
              <Field label="Area">
                <select className="select" value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: parseInt(e.target.value) })}>
                  {zones.map((z) => <option key={z.zone_id} value={z.zone_id}>{z.zone_name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="What is the situation? *">
              <textarea className="textarea" rows={4} required maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="e.g. Water reached the first floor, 8 people trapped including 2 infants with no drinking water or baby milk." />
            </Field>
            <button className="btn btn-danger" disabled={submitting}><Siren size={16} /> {submitting ? 'Submitting…' : 'Submit emergency call'}</button>
          </form>

          {analysis && (
            <div className="alert alert-success" style={{ marginTop: 16 }}>
              <div>
                <div className="strong small">Call recorded · priority {humanize(analysis.detectedUrgency).toLowerCase()}</div>
                <div className="small">
                  Suggested supplies: {analysis.topMatch ? analysis.topMatch.categoryName : 'general relief kit'}
                </div>
              </div>
            </div>
          )}
        </Panel>

        <Panel icon={<Radio size={18} className="c-rose" />} title={`Recent emergency calls (${signals.length})`} subtitle="Most urgent first">
          <Async loading={sos.loading} error={sos.error} empty={!signals.length} emptyText="No calls recorded yet.">
            <div className="stack-sm scroll-y">
              {signals.map((s) => (
                <div key={s.id} className="item">
                  <div className="row-between">
                    <span className="strong">{s.sender_name} <span className="small muted">· {s.victim_count} people · {s.zone_name}</span></span>
                    <div className="row"><Badge value={s.status} /><Badge value={s.detected_urgency} /></div>
                  </div>
                  <p className="small soft italic">“{s.raw_message}”</p>
                  <div className="row-between tiny muted">
                    <span>Suggested supplies: <strong>{s.matched_category_name ?? 'general relief kit'}</strong></span>
                    <span>{fmtDateTime(s.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Async>
        </Panel>
      </div>
    </div>
  );
}
