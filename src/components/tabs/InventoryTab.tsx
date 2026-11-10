'use client';
// Warehouse stock table + add stock (INSERT ... ON CONFLICT DO UPDATE)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)

import { useMemo, useState } from 'react';
import { Database, Package } from 'lucide-react';
import { useApi, useSession } from '@/lib/client/session';
import { useToast } from '@/lib/client/toast';
import { can } from '@/lib/permissions';
import { Async, Badge, Field, fmt, fmtDateTime, humanize, Panel, Table } from '../ui';

export default function InventoryTab() {
  const { api, refresh, user } = useSession();
  const notify = useToast();
  const inv = useApi('/api/inventory');
  const rows: any[] = inv.data?.inventory ?? [];
  const warehouses: any[] = inv.data?.warehouses ?? [];
  const categories: any[] = inv.data?.categories ?? [];

  const [filter, setFilter] = useState<'ALL' | number>('ALL');
  const [form, setForm] = useState({ warehouseId: 1, categoryId: 1, quantity: 500 });
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => (filter === 'ALL' ? rows : rows.filter((r) => r.warehouse_id === filter)), [rows, filter]);
  const lowCount = rows.filter((r) => r.stock_status !== 'SUFFICIENT').length;

  async function restock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api('/api/inventory', { method: 'POST', body: { ...form, restockQuantity: form.quantity } });
      notify(`${fmt(form.quantity)} units added — now ${fmt(data.updatedInventory.available_quantity)} available.`, 'success');
      refresh();
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {can(user?.role, 'restock') && (
        <Panel
          accent
          icon={<Package size={18} className="c-cyan" />}
          title="Add stock"
          subtitle="Record new relief material received at a warehouse"
        >
          <form className="form-grid" onSubmit={restock} style={{ alignItems: 'end' }}>
            <Field label="Warehouse">
              <select className="select" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: Number(e.target.value) })}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Item">
              <select className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: Number(e.target.value) })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Quantity">
              <input className="input" type="number" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
            </Field>
            <button className="btn btn-primary" disabled={busy}><Package size={16} /> {busy ? 'Saving…' : 'Add to stock'}</button>
          </form>
        </Panel>
      )}

      <Panel
        icon={<Database size={18} className="c-emerald" />}
        title="Current stock"
        subtitle={`Reserved = already loaded on a vehicle · ${lowCount} item(s) running low`}
        actions={
          <>
            <button className={`btn btn-chip${filter === 'ALL' ? ' active' : ''}`} onClick={() => setFilter('ALL')}>All warehouses</button>
            {warehouses.map((w) => (
              <button key={w.id} className={`btn btn-chip${filter === w.id ? ' active' : ''}`} onClick={() => setFilter(w.id)}>{w.name.split(' ')[0]}</button>
            ))}
          </>
        }
      >
        <Async loading={inv.loading} error={inv.error} empty={!rows.length}>
          <Table head={['Warehouse', 'Item', 'Type', 'Available', 'Reserved', 'Minimum level', 'Status', 'Last restocked']}>
            {visible.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.warehouse_name}</strong><div className="sub">{r.location_name}</div></td>
                <td>{r.resource_name}</td>
                <td>{humanize(r.category_group)}</td>
                <td className="num"><strong>{fmt(r.available_quantity)}</strong> <span className="sub">{r.unit_of_measure}</span></td>
                <td className="num">{fmt(r.reserved_quantity)}</td>
                <td className="num">{fmt(r.minimum_threshold)}</td>
                <td><Badge value={r.stock_status} /></td>
                <td className="small muted">{fmtDateTime(r.last_restocked_at)}</td>
              </tr>
            ))}
          </Table>
        </Async>
      </Panel>
    </div>
  );
}
