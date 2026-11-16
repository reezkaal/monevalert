import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bell, CalendarDays, Check, ChevronRight, ExternalLink, History, Home, Menu, Settings, ShieldCheck, Sparkles, X } from 'lucide-react';
import './styles.css';

type Page = 'Dashboard' | 'History' | 'Settings';
type RecordItem = { date: string; time: string; sent: number };
type AppSettings = { start: string; end: string; interval: number; enabled: boolean; days: boolean[]; sound: boolean };
const WIB = 'Asia/Jakarta';
const settingsKey = 'absensi-monev-settings';
const pad = (value: number) => String(value).padStart(2, '0');
const toMinute = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
const scheduleFor = (settings: AppSettings) => {
  const interval = Math.max(5, Number(settings.interval) || 30);
  const start = toMinute(settings.start);
  const end = toMinute(settings.end);
  if (start >= end) return [];
  const result: number[] = [];
  for (let slot = start; slot <= end; slot += interval) result.push(slot);
  return result;
};
const timeLabel = (minute: number) => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
const dateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: WIB }).format(new Date());
const defaultSettings: AppSettings = { start: '16:00', end: '21:00', interval: 30, enabled: true, days: [true, true, true, true, true], sound: false };
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
const wibMinute = () => { const p = new Intl.DateTimeFormat('en-US', { timeZone: WIB, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); const get = (t: string) => Number(p.find((x) => x.type === t)?.value || 0); return get('hour') * 60 + get('minute'); };
const wibDayIndex = () => ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4 } as Record<string, number>)[new Intl.DateTimeFormat('en-US', { timeZone: WIB, weekday: 'short' }).format(new Date())] ?? -1;
const isActiveDay = (settings: AppSettings) => settings.days[wibDayIndex()] === true;


function App() {
  const [page, setPage] = useState<Page>('Dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [records, setRecords] = useState<RecordItem[]>(() => read('absensi-records', []));
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...defaultSettings, ...read(settingsKey, defaultSettings) }));
  const [toast, setToast] = useState('');
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const today = records.find((record) => record.date === dateKey());
  const current = wibMinute();
  const schedule = scheduleFor(settings);
  const next = !today && settings.enabled && isActiveDay(settings) ? schedule.find((slot) => slot > current) : undefined;
  const dateText = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: WIB }).format(now);

  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => localStorage.setItem('absensi-records', JSON.stringify(records)), [records]);
  useEffect(() => localStorage.setItem(settingsKey, JSON.stringify(settings)), [settings]);
  const notify = (message: string) => {
    setToast(message); window.setTimeout(() => setToast(''), 4200);
    if (permission === 'granted') new Notification('Absensi Monev MagangHub', { body: message });
  };
  useEffect(() => {
    if (!settings.enabled || today || !isActiveDay(settings)) return;
    const id = window.setInterval(() => {
      const slot = scheduleFor(settings).find((item) => item === wibMinute()); const stamp = `${dateKey()}-${slot}`;
      const fired = read<string[]>('absensi-monev-fired', []);
      if (slot !== undefined && !fired.includes(stamp)) { localStorage.setItem('absensi-monev-fired', JSON.stringify([...fired, stamp])); notify('Waktunya konfirmasi absensi pulang di Portal Monev MagangHub.'); }
    }, 15000);
    return () => window.clearInterval(id);
  }, [settings, today, permission]);
  const mark = () => {
    if (today) return;
    const time = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit' }).format(new Date());
    setRecords([{ date: dateKey(), time, sent: schedule.filter((slot) => slot <= current).length }, ...records]);
    notify('Konfirmasi lokal tersimpan. Pastikan absensi resmi di portal Monev juga selesai.');
  };
  const request = async () => {
    if (!('Notification' in window)) { notify('Browser ini tidak mendukung notifikasi.'); return; }
    const state = await Notification.requestPermission(); setPermission(state);
    notify(state === 'granted' ? 'Notifikasi browser aktif.' : 'Izin notifikasi belum diizinkan.');
  };
  const updateSettings = (patch: Partial<AppSettings>) => setSettings((value) => ({ ...value, ...patch }));

  return <div className="shell">
    <Sidebar page={page} setPage={setPage} />
    {mobileMenuOpen && (
      <MobileDrawer
        page={page}
        setPage={(p) => { setPage(p); setMobileMenuOpen(false); }}
        onClose={() => setMobileMenuOpen(false)}
      />
    )}
    <main id="main-content">
      <Header page={page} dateText={dateText} active={settings.enabled && !today} onOpenMenu={() => setMobileMenuOpen(true)} />
      {page === 'Dashboard' && <Dashboard now={now} dateText={dateText} schedule={schedule} current={current} next={next} today={today} onMark={mark} permission={permission} onRequest={request} notify={notify} settings={settings} />}
      {page === 'History' && <HistoryPage records={records} />}
      {page === 'Settings' && <SettingsPage settings={settings} update={updateSettings} permission={permission} onRequest={request} notify={notify} />}
    </main>
    {toast && <div className="toast"><Bell size={16} /><span>{toast}</span><a href="https://monev.maganghub.kemnaker.go.id/dashboard" target="_blank" rel="noopener noreferrer">Buka portal</a></div>}
  </div>;
}

function Sidebar({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  const nav: [Page, typeof Home][] = [['Dashboard', Home], ['History', History], ['Settings', Settings]];
  return <aside className="sidebar"><div className="logo"><span><Sparkles size={18} /></span><b>Absensi<br />Monev</b></div><p className="sidebarLabel">MAGANGHUB</p><nav>{nav.map(([name, Icon]) => <button key={name} className={page === name ? 'navItem active' : 'navItem'} onClick={() => setPage(name)}><Icon size={18} /> <span>{name}</span></button>)}</nav><div className="sideStatus"><ShieldCheck size={17} /><span>Pengingat lokal<b>Asia/Jakarta</b></span></div></aside>;
}

function MobileDrawer({ page, setPage, onClose }: { page: Page; setPage: (page: Page) => void; onClose: () => void }) {
  const nav: [Page, typeof Home][] = [['Dashboard', Home], ['History', History], ['Settings', Settings]];
  return (
    <>
      <div className="drawerBackdrop" onClick={onClose} />
      <aside className="mobileDrawer" aria-label="Menu navigasi mobile">
        <div className="drawerHeader">
          <div className="logo"><span><Sparkles size={18} /></span><b>Absensi<br />Monev</b></div>
          <button className="drawerClose" onClick={onClose} aria-label="Tutup menu"><X size={18} /></button>
        </div>
        <p className="sidebarLabel">NAVIGASI</p>
        <nav className="drawerNav">
          {nav.map(([name, Icon]) => (
            <button key={name} className={page === name ? 'navItem active' : 'navItem'} onClick={() => setPage(name)}>
              <Icon size={18} /> <span>{name}</span>
            </button>
          ))}
        </nav>
        <a href="https://monev.maganghub.kemnaker.go.id/dashboard" target="_blank" rel="noopener noreferrer" className="drawerPortalLink">
          <span>Buka Portal Monev</span><ExternalLink size={15} />
        </a>
        <div className="sideStatus" style={{ marginTop: 'auto' }}>
          <ShieldCheck size={17} /><span>Pengingat lokal<b>Asia/Jakarta (WIB)</b></span>
        </div>
      </aside>
    </>
  );
}

function Header({ page, dateText, active, onOpenMenu }: { page: Page; dateText: string; active: boolean; onOpenMenu: () => void }) {
  return <header className="topbar"><button className="menuButton" aria-label="Buka menu navigasi" onClick={onOpenMenu}><Menu size={20} /></button><div><p className="kicker">{page === 'Dashboard' ? 'MONEV MAGANGHUB' : page.toUpperCase()}</p><h1>{page === 'Dashboard' ? 'Selamat datang kembali.' : page === 'History' ? 'Riwayat konfirmasi.' : 'Atur pengingatmu.'}</h1></div><div className="headerMeta"><span className={active ? 'status live' : 'status'}><i />{active ? 'Reminder aktif' : 'Reminder berhenti'}</span><span>{dateText}</span></div></header>;
}
type DashboardProps = { now: Date; dateText: string; schedule: number[]; current: number; next: number | undefined; today?: RecordItem; onMark: () => void; permission: NotificationPermission | 'unsupported'; onRequest: () => void; notify: (text: string) => void; settings: AppSettings };
function Dashboard({ now, dateText, schedule, current, next, today, onMark, permission, onRequest, notify, settings }: DashboardProps) {
 const clock = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now); const remaining = next === undefined ? '-' : `${Math.floor((next - current) / 60)}j ${pad((next - current) % 60)}m`;
 return <div className="pageEnter"><section className="heroGrid"><article className="clockWidget clayBlue"><div className="widgetTop"><span className="timezone"><i />WIB / ASIA JAKARTA</span><CalendarDays size={21} /></div><div className="clockValue">{clock}</div><p>{dateText}</p><div className="countdown"><span>{next === undefined ? 'Tidak ada reminder berikutnya' : `Reminder berikutnya ${timeLabel(next)}`}</span><b>{remaining}</b></div></article><article className={today ? 'attendance confirmed' : 'attendance'}><div className="checkBubble"><Check size={22} /></div><p className="kicker">KONFIRMASI LOKAL</p><h2>{today ? 'Sudah dikonfirmasi' : 'Belum dikonfirmasi'}</h2><p>{today ? `Tersimpan lokal pukul ${today.time} WIB.` : 'Setelah absensi resmi, catat konfirmasi lokal agar reminder berhenti.'}</p><button className="primaryButton" onClick={onMark} disabled={!!today}>{today ? 'Konfirmasi tersimpan' : 'Saya Sudah Absensi'} <ChevronRight size={17} /></button></article></section><article className="portalCard"><div><p className="kicker">PORTAL RESMI</p><h2>Portal Absensi Monev MagangHub</h2><p>Lakukan absensi pulang melalui portal resmi MagangHub Kementerian Ketenagakerjaan.</p></div><a href="https://monev.maganghub.kemnaker.go.id/dashboard" target="_blank" rel="noopener noreferrer">Buka Portal Absensi <ExternalLink size={17} /></a></article><section className="sectionTitle"><div><p className="kicker">JADWAL HARI INI</p><h2>Pengingat pulang</h2></div><span>{`Setiap ${settings.interval} menit · ${settings.start}–${settings.end}`}</span></section><div className="timeline">{schedule.map((slot) => { const done = !!today || current >= slot; const upcoming = !done && slot === next; return <div className={`timeSlot ${done ? 'done' : ''} ${upcoming ? 'upcoming' : ''}`} key={slot}><i>{done && <Check size={12} />}</i><b>{timeLabel(slot)}</b><small>{done ? 'Terkirim' : upcoming ? 'Berikutnya' : 'Menunggu'}</small></div>; })}</div><section className="notificationBar"><Bell size={20} /><div><b>Notifikasi browser</b><p>{permission === 'granted' ? 'Izin aktif. Notifikasi siap dikirim saat jadwal tiba.' : permission === 'denied' ? 'Izin ditolak. Ubah melalui pengaturan browser.' : 'Aktifkan agar tidak melewatkan pengingat.'}</p></div><button className="softButton" onClick={permission === 'granted' ? () => notify('Ini notifikasi percobaan dari Absensi Monev.') : onRequest}>{permission === 'granted' ? 'Uji notifikasi' : 'Aktifkan'}</button></section></div>;
}

function HistoryPage({ records }: { records: RecordItem[] }) {
 const [filter, setFilter] = useState(''); const view = records.filter((item) => !filter || item.date === filter); const monthly = records.filter((item) => item.date.slice(0, 7) === dateKey().slice(0, 7)).length;
 return <div className="pageEnter"><section className="historyHero"><div><p className="kicker">RIWAYAT LOKAL</p><h2>Rekap konfirmasi.</h2><p>Catatan ini tidak memverifikasi absensi resmi di portal Monev.</p></div><div className="metric"><b>{monthly}</b><span>konfirmasi bulan ini</span></div></section><div className="filter"><label htmlFor="date">Filter tanggal</label><input id="date" type="date" value={filter} onChange={(event) => setFilter(event.target.value)} /><button className="softButton" onClick={() => setFilter('')}>Reset</button></div>{view.length ? <div className="historyList">{view.map((item) => <article className="historyItem" key={item.date}><span className="historyIcon"><CalendarDays size={18} /></span><div><b>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date(`${item.date}T00:00:00`))}</b><small>Konfirmasi lokal {item.time} WIB · {item.sent} reminder terkirim</small></div><span className="successTag"><Check size={14} /> Dikonfirmasi</span></article>)}</div> : <div className="empty"><History size={30} /><h3>Belum ada riwayat</h3><p>Konfirmasi absensi lokal akan tampil di sini.</p></div>}</div>;
}
function SettingsPage({ settings, update, permission, onRequest, notify }: { settings: AppSettings; update: (patch: Partial<AppSettings>) => void; permission: NotificationPermission | 'unsupported'; onRequest: () => void; notify: (text: string) => void }) {
 const toggleDay = (index: number) => { const days = [...settings.days]; days[index] = !days[index]; update({ days }); }; const names = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
 return <div className="pageEnter settingsPage"><section className="settingsHero"><p className="kicker">PENGATURAN</p><h2>Jadwal yang cocok untukmu.</h2><p>Pengaturan tersimpan lokal di perangkat ini.</p></section><section className="settingsCard"><div className="inputGrid"><label>Jam mulai<input type="time" value={settings.start} onChange={(event) => update({ start: event.target.value })} /></label><label>Jam selesai<input type="time" value={settings.end} onChange={(event) => update({ end: event.target.value })} /></label><label>Interval (menit)<input type="number" min="5" max="180" step="5" value={settings.interval} onChange={(event) => update({ interval: Math.max(1, Number(event.target.value) || 30) })} /></label></div><div className="settingRow"><div><b>Pengingat aktif</b><small>Hentikan seluruh reminder pada perangkat ini.</small></div><button className={settings.enabled ? 'toggle on' : 'toggle'} onClick={() => update({ enabled: !settings.enabled })} aria-label="Aktifkan reminder"><i /></button></div><div className="settingRow"><div><b>Hari aktif</b><small>Default Senin sampai Jumat.</small></div><div className="days">{names.map((name, index) => <button className={settings.days[index] ? 'day on' : 'day'} onClick={() => toggleDay(index)} key={name}>{name}</button>)}</div></div><div className="settingRow"><div><b>Notifikasi browser</b><small>Status: {permission === 'granted' ? 'diizinkan' : permission === 'denied' ? 'ditolak' : 'belum diizinkan'}.</small></div><button className="softButton" onClick={onRequest}>Minta izin</button></div><div className="settingRow"><div><b>Uji pengingat</b><small>Kirim toast dan notifikasi sistem bila izin aktif.</small></div><button className="softButton" onClick={() => notify('Pengingat percobaan Absensi Monev.')}>Uji sekarang</button></div></section><div className="note"><ShieldCheck size={18} /><p>Browser Notification tidak dijamin aktif saat browser ditutup. Fitur tersebut memerlukan Web Push, Service Worker, push subscription, serta backend push service.</p></div></div>;
}
createRoot(document.getElementById('root')!).render(<App />);
