'use client';
// ============================================================================
// Root client component: providers, sign-in gate, portal header, menu, pages
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { useEffect, useState } from 'react';
import {
  ClipboardList, Home, LifeBuoy, LogOut, MapPin, Package, Phone, RotateCw, Siren, Tent, Truck, Users, Warehouse,
} from 'lucide-react';
import { SessionProvider, useApi, useSession } from '@/lib/client/session';
import { ToastProvider, useToast } from '@/lib/client/toast';
import { canOpen, DEMO_ACCOUNTS, PageId, ROLE_LABELS, UserRole } from '@/lib/permissions';
import { fmt, num } from './ui';
import LoginScreen from './LoginScreen';
import DashboardTab from './tabs/DashboardTab';
import SosTab from './tabs/SosTab';
import DispatchTab from './tabs/DispatchTab';
import InventoryTab from './tabs/InventoryTab';
import CampsTab from './tabs/CampsTab';
import TelemetryTab from './tabs/TelemetryTab';

export type TabId = PageId;
export type Navigate = (tab: TabId, opts?: { requestId?: number }) => void;

const TABS: { id: TabId; label: string; icon: React.ElementType; title: string; desc: string }[] = [
  { id: 'dashboard', label: 'Overview', icon: Home, title: 'Relief Operations Overview', desc: 'Current status of affected areas, relief camps and pending supply requests.' },
  { id: 'sos', label: 'Emergency Calls', icon: Siren, title: 'Emergency Calls', desc: 'Record a new distress call or look through calls received from affected areas.' },
  { id: 'dispatch', label: 'Supplies & Shipments', icon: Truck, title: 'Supplies & Shipments', desc: 'Send stock from a warehouse to a camp, and track shipments until they are delivered.' },
  { id: 'inventory', label: 'Warehouse Stock', icon: Warehouse, title: 'Warehouse Stock', desc: 'Relief material available at each warehouse. Add new stock when it arrives.' },
  { id: 'camps', label: 'Relief Camps', icon: Tent, title: 'Relief Camps', desc: 'Occupancy and priority of each relief camp, and the supplies they are still short of.' },
  { id: 'telemetry', label: 'Field Reports', icon: ClipboardList, title: 'Field Reports', desc: 'Drone survey summaries and incident reports received from the field.' },
];

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <TopStrip />
        <Gate />
        <footer className="site-footer">
          <div className="container">
            <span>© ReliefChain — Disaster Relief Management Portal</span>
            <span>DBMS Mini Project, PES University · Academic demonstration, not an official government website</span>
          </div>
        </footer>
      </SessionProvider>
    </ToastProvider>
  );
}

function TopStrip() {
  const [today, setToday] = useState('');
  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }, []);
  return (
    <div className="top-strip">
      <div className="container">
        <span>{today}</span>
        <div className="helpline">
          <span><Phone size={12} style={{ verticalAlign: '-2px' }} /> Emergency: <strong>112</strong></span>
          <span>Disaster Helpline: <strong>1078</strong></span>
        </div>
      </div>
    </div>
  );
}

function Gate() {
  const { user, ready } = useSession();
  if (!ready) return <div className="login-wrap"><RotateCw className="spin c-cyan" /></div>;
  return user ? <Shell /> : <LoginScreen />;
}

function Shell() {
  const { user, login, logout, refresh } = useSession();
  const notify = useToast();
  const [tab, setTab] = useState<TabId>('dashboard');
  const [preselectRequest, setPreselectRequest] = useState<number | undefined>();
  const [switching, setSwitching] = useState(false);
  const dash = useApi('/api/dashboard');
  const m = dash.data?.metrics;
  const role = user!.role;
  const visibleTabs = TABS.filter((t) => canOpen(role, t.id));

  // If the signed-in role can't open the current page, fall back to the overview.
  useEffect(() => {
    if (!canOpen(role, tab)) setTab('dashboard');
  }, [role, tab]);

  const navigate: Navigate = (next, opts) => {
    if (!canOpen(role, next)) return;
    setPreselectRequest(opts?.requestId);
    setTab(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  async function switchRole(next: UserRole) {
    const account = DEMO_ACCOUNTS.find((a) => a.role === next);
    if (!account) return;
    setSwitching(true);
    try {
      await login(account.email, account.password);
      refresh();
      notify(`Signed in as ${ROLE_LABELS[next]}.`, 'info');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setSwitching(false);
    }
  }

  const page = TABS.find((t) => t.id === tab) ?? TABS[0];
  const openCalls = num(m?.unresolved_sos);

  return (
    <div className="app">
      <header className="header">
        <div className="container">
          <div className="brand">
            <div className="brand-icon"><LifeBuoy size={28} /></div>
            <div>
              <div className="brand-title">ReliefChain</div>
              <div className="brand-subtitle">Disaster Relief Management Portal</div>
            </div>
          </div>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={refresh} title="Reload latest data">
              <RotateCw size={14} className={dash.loading ? 'spin' : ''} /> Refresh
            </button>
            <div className="user-pill">
              <div>
                <div className="name">{switching ? 'Signing in…' : user!.fullName}</div>
                <label className="role">
                  Signed in as
                  <select value={role} disabled={switching} onChange={(e) => switchRole(e.target.value as UserRole)}>
                    {DEMO_ACCOUNTS.map((a) => <option key={a.role} value={a.role}>{ROLE_LABELS[a.role]}</option>)}
                  </select>
                </label>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={logout} title="Sign out"><LogOut size={15} /> Sign out</button>
            </div>
          </div>
        </div>
      </header>
      <div className="accent-line" />

      <nav className="tabs" aria-label="Sections">
        <div className="container">
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={15} /> {label}
              {id === 'sos' && openCalls > 0 && <span className="count">{openCalls}</span>}
            </button>
          ))}
        </div>
      </nav>

      {openCalls > 0 && (
        <div className="alert-bar">
          <div className="container">
            <span className="label">Alert</span>
            <span>{openCalls} emergency call(s) awaiting response · {fmt(m?.open_requests)} supply request(s) still open.</span>
          </div>
        </div>
      )}

      <main>
        <div className="container">
          <div className="page-head">
            <div className="breadcrumb">Home{tab !== 'dashboard' && <> › {page.label}</>}</div>
            <h1>{page.title}</h1>
            <p>{page.desc}</p>
          </div>

          {dash.error && (
            <div className="alert alert-error" style={{ marginBottom: 24 }}>
              Could not load data: {dash.error}. Start the databases with <code>docker compose up -d</code>, then press Refresh.
            </div>
          )}

          {tab === 'dashboard' && (
            <section className="kpis">
              <Kpi tone="red" label="Affected areas" icon={<MapPin size={16} />} value={m?.active_zones} sub="Currently active" />
              <Kpi label="People in camps" icon={<Users size={16} />} value={m?.total_displaced_sheltered} sub={`Across ${m?.operational_camps ?? '–'} camps`} />
              <Kpi tone="green" label="Stock available" icon={<Package size={16} />} value={m?.global_stock_units} sub="Units in all warehouses" />
              <Kpi tone="amber" label="Emergency calls" icon={<Siren size={16} />} value={m?.unresolved_sos} sub="Awaiting response" />
              <Kpi label="Shipments on the way" icon={<Truck size={16} />} value={m?.active_missions} sub={`${m?.available_vehicles ?? '–'} vehicles free`} />
            </section>
          )}

          {tab === 'dashboard' && <DashboardTab data={dash.data} loading={dash.loading} error={dash.error} navigate={navigate} />}
          {tab === 'sos' && <SosTab zones={dash.data?.disasterZones ?? []} />}
          {tab === 'dispatch' && <DispatchTab preselectRequest={preselectRequest} />}
          {tab === 'inventory' && <InventoryTab />}
          {tab === 'camps' && <CampsTab zones={dash.data?.disasterZones ?? []} />}
          {tab === 'telemetry' && <TelemetryTab zones={dash.data?.disasterZones ?? []} />}
        </div>
      </main>
    </div>
  );
}

function Kpi({ label, icon, value, sub, tone = '' }: { label: string; icon: React.ReactNode; value: unknown; sub: string; tone?: string }) {
  return (
    <div className={`kpi ${tone}`}>
      <div className="kpi-head"><span className="kpi-label">{label}</span>{icon}</div>
      <div className="kpi-value">{value === undefined ? '–' : fmt(value)}</div>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
}
