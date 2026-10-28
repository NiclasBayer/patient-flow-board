import React, { useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// FlowBoard: live patient flow for a hospital, from arrival to discharge.
// All data is synthetic and generated in the browser.
// ---------------------------------------------------------------------------

const STAGES = [
  { key: 'arrival', label: 'Arrival', target: 10 },
  { key: 'triage', label: 'Triage', target: 20 },
  { key: 'diagnostics', label: 'Diagnostics', target: 75 },
  { key: 'awaiting', label: 'Awaiting bed', target: 60 },
  { key: 'ward', label: 'On ward', target: null },
  { key: 'discharge', label: 'Discharge ready', target: 60 },
];
const NEXT = { arrival: 'triage', triage: 'diagnostics', diagnostics: 'awaiting', awaiting: 'ward', ward: 'discharge', discharge: null };
const ED_STAGES = ['arrival', 'triage', 'diagnostics', 'awaiting'];

const ACUITY = {
  1: { label: 'Immediate', color: '#d6253c' },
  2: { label: 'Very urgent', color: '#f07d1a' },
  3: { label: 'Urgent', color: '#e8b80e' },
  4: { label: 'Standard', color: '#3fae49' },
  5: { label: 'Non-urgent', color: '#2f8fd8' },
};

const COMPLAINTS = [
  { text: 'Chest pain', ward: 'Cardiology', admit: 0.6, acuity: [2, 3] },
  { text: 'Palpitations', ward: 'Cardiology', admit: 0.4, acuity: [3, 4] },
  { text: 'Shortness of breath', ward: 'Internal Medicine', admit: 0.6, acuity: [2, 3] },
  { text: 'Fever, infection', ward: 'Internal Medicine', admit: 0.5, acuity: [3, 4] },
  { text: 'Abdominal pain', ward: 'Surgery', admit: 0.4, acuity: [3, 4] },
  { text: 'Fall, hip injury', ward: 'Surgery', admit: 0.7, acuity: [2, 3] },
  { text: 'Stroke symptoms', ward: 'Neurology', admit: 0.9, acuity: [1, 2] },
  { text: 'Syncope', ward: 'Neurology', admit: 0.4, acuity: [3, 4] },
  { text: 'Acute confusion', ward: 'Geriatrics', admit: 0.7, acuity: [2, 3] },
  { text: 'Sepsis suspected', ward: 'ICU', admit: 0.95, acuity: [1, 2] },
  { text: 'Back pain', ward: 'Surgery', admit: 0.1, acuity: [4, 5] },
  { text: 'Minor laceration', ward: 'Surgery', admit: 0.05, acuity: [4, 5] },
];

const INITIAL_WARDS = [
  { name: 'Cardiology', beds: 32, occupied: 30 },
  { name: 'Internal Medicine', beds: 48, occupied: 45 },
  { name: 'Surgery', beds: 40, occupied: 34 },
  { name: 'Neurology', beds: 24, occupied: 21 },
  { name: 'Geriatrics', beds: 30, occupied: 27 },
  { name: 'ICU', beds: 12, occupied: 11 },
];

const START_MINUTE = 10 * 60 + 40; // 10:40
const TICK_MINUTES = 5;
const TICK_MS = 2200;

// Small seeded random generator so every demo starts from the same picture.
function mulberry32(seed) {
  let a = seed;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

function clock(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function duration(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function makePatient(num, now, rnd, stage = 'arrival', agoInStage = 0, totalAgo = 0) {
  const c = pick(COMPLAINTS, rnd);
  const acuity = c.acuity[Math.floor(rnd() * c.acuity.length)];
  const arrivedAt = now - totalAgo;
  const since = now - agoInStage;
  const order = STAGES.map((s) => s.key);
  const history = [];
  const idx = order.indexOf(stage);
  for (let i = 0; i <= idx; i++) {
    const at = i === idx ? since : arrivedAt + ((since - arrivedAt) * i) / Math.max(1, idx);
    history.push({ stage: order[i], at });
  }
  return {
    id: `P-${num}`,
    age: 19 + Math.floor(rnd() * 72),
    sex: rnd() < 0.5 ? 'F' : 'M',
    complaint: c.text,
    ward: c.ward,
    needsAdmission: stage === 'awaiting' || stage === 'ward' || stage === 'discharge' ? true : rnd() < c.admit,
    acuity,
    stage,
    arrivedAt,
    since,
    history,
  };
}

function buildInitial() {
  const rnd = mulberry32(42);
  const now = START_MINUTE;
  const patients = [];
  let n = 1031;
  const layout = [
    ['arrival', 3, [2, 14]],
    ['triage', 3, [5, 28]],
    ['diagnostics', 5, [15, 110]],
    ['awaiting', 4, [20, 150]],
    ['ward', 4, [40, 200]],
    ['discharge', 3, [20, 95]],
  ];
  for (const [stage, count, [lo, hi]] of layout) {
    for (let i = 0; i < count; i++) {
      const inStage = lo + Math.floor(rnd() * (hi - lo));
      const total = inStage + 20 + Math.floor(rnd() * 120);
      patients.push(makePatient(n++, now, rnd, stage, inStage, total));
    }
  }
  const hourly = { arrivals: Array(24).fill(0), discharges: Array(24).fill(0) };
  [[6, 3, 2], [7, 6, 3], [8, 9, 5], [9, 12, 6], [10, 7, 4]].forEach(([h, a, d]) => {
    hourly.arrivals[h] = a;
    hourly.discharges[h] = d;
  });
  return {
    now,
    patients,
    wards: INITIAL_WARDS.map((w) => ({ ...w })),
    nextId: n,
    hourly,
    dischargedToday: 20,
    admittedToday: 14,
    log: [
      { at: now - 4, text: 'P-1048 moved to Triage' },
      { at: now - 9, text: 'Bed released on Surgery' },
      { at: now - 15, text: 'P-1041 admitted to Cardiology' },
    ],
  };
}

function moveTo(p, stage, now) {
  return { ...p, stage, since: now, history: [...p.history, { stage, at: now }] };
}

function step(s, rnd, extraArrivals = 0) {
  const now = s.now + TICK_MINUTES;
  const hour = Math.floor(now / 60) % 24;
  const wards = s.wards.map((w) => ({ ...w }));
  const hourly = { arrivals: [...s.hourly.arrivals], discharges: [...s.hourly.discharges] };
  const log = [];
  const patients = [];
  let { nextId, dischargedToday, admittedToday } = s;

  for (const p of s.patients) {
    const t = now - p.since;
    let q = p;
    if (p.stage === 'arrival' && t >= 5 && rnd() < 0.55) {
      q = moveTo(p, 'triage', now);
      log.push({ at: now, text: `${p.id} moved to Triage` });
    } else if (p.stage === 'triage' && t >= 10 && rnd() < 0.4) {
      q = moveTo(p, 'diagnostics', now);
      log.push({ at: now, text: `${p.id} sent to Diagnostics` });
    } else if (p.stage === 'diagnostics' && t >= 30 && rnd() < 0.22) {
      if (p.needsAdmission) {
        q = moveTo(p, 'awaiting', now);
        log.push({ at: now, text: `${p.id} needs a ${p.ward} bed` });
      } else {
        dischargedToday += 1;
        hourly.discharges[hour] += 1;
        log.push({ at: now, text: `${p.id} treated and sent home` });
        continue;
      }
    } else if (p.stage === 'awaiting' && t >= 10) {
      const w = wards.find((x) => x.name === p.ward);
      if (w && w.occupied < w.beds && rnd() < 0.35) {
        w.occupied += 1;
        admittedToday += 1;
        q = moveTo(p, 'ward', now);
        log.push({ at: now, text: `${p.id} admitted to ${p.ward}` });
      }
    } else if (p.stage === 'ward' && t >= 60 && rnd() < 0.07) {
      q = moveTo(p, 'discharge', now);
      log.push({ at: now, text: `${p.id} ready for discharge` });
    } else if (p.stage === 'discharge' && t >= 15 && rnd() < 0.28) {
      const w = wards.find((x) => x.name === p.ward);
      if (w) w.occupied = Math.max(0, w.occupied - 1);
      dischargedToday += 1;
      hourly.discharges[hour] += 1;
      log.push({ at: now, text: `${p.id} discharged, bed free on ${p.ward}` });
      continue;
    }
    patients.push(q);
  }

  // Other inpatients leave the hospital too.
  if (rnd() < 0.3) {
    const w = pick(wards.filter((x) => x.occupied > 0), rnd);
    if (w) {
      w.occupied -= 1;
      dischargedToday += 1;
      hourly.discharges[hour] += 1;
      log.push({ at: now, text: `Bed released on ${w.name}` });
    }
  }

  const arrivals = (rnd() < 0.5 ? 1 : 0) + extraArrivals;
  for (let i = 0; i < arrivals; i++) {
    const np = makePatient(nextId++, now, rnd, 'arrival', 0, 0);
    patients.push(np);
    hourly.arrivals[hour] += 1;
    log.push({ at: now, text: `${np.id} arrived: ${np.complaint}` });
  }

  return {
    now,
    patients,
    wards,
    nextId,
    hourly,
    dischargedToday,
    admittedToday,
    log: [...log.reverse(), ...s.log].slice(0, 40),
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <svg viewBox="0 0 40 40" className="logo" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#10384f" />
      <path d="M6 22h7l3-8 5 15 4-11 2 4h7" fill="none" stroke="#89d329" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function PatientCard({ p, now, target, onOpen }) {
  const inStage = now - p.since;
  const late = target && inStage > target;
  const warn = target && !late && inStage > target * 0.75;
  return (
    <button className={`pcard ${late ? 'late' : ''} ${warn ? 'warn' : ''}`} onClick={() => onOpen(p.id)}>
      <span className="pcard-stripe" style={{ background: ACUITY[p.acuity].color }} />
      <div className="pcard-top">
        <span className="pcard-id">{p.id}</span>
        <span className={`pcard-time ${late ? 'late' : ''}`}>{duration(inStage)}</span>
      </div>
      <div className="pcard-complaint">{p.complaint}</div>
      <div className="pcard-meta">
        {p.age} {p.sex}
        {p.needsAdmission && (p.stage === 'awaiting' || p.stage === 'ward' || p.stage === 'discharge') && (
          <span className="pcard-ward">{p.ward}</span>
        )}
      </div>
    </button>
  );
}

function WardBar({ w, waiting }) {
  const pct = Math.round((w.occupied / w.beds) * 100);
  const tone = pct >= 95 ? 'crit' : pct >= 88 ? 'high' : 'ok';
  return (
    <div className="ward">
      <div className="ward-head">
        <span className="ward-name">{w.name}</span>
        <span className="ward-num">
          {w.occupied}/{w.beds}
          {waiting > 0 && <span className="ward-wait"> +{waiting} waiting</span>}
        </span>
      </div>
      <div className="bar">
        <div className={`bar-fill ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="ward-foot">
        <span className={`ward-pct ${tone}`}>{pct}%</span>
        <span>{Math.max(0, w.beds - w.occupied)} free</span>
      </div>
    </div>
  );
}

function FlowChart({ hourly, now }) {
  const current = Math.floor(now / 60) % 24;
  const hours = [];
  for (let h = 6; h <= Math.max(current, 11); h++) hours.push(h);
  const max = Math.max(4, ...hours.map((h) => Math.max(hourly.arrivals[h], hourly.discharges[h])));
  const W = 560;
  const H = 170;
  const pad = { l: 28, r: 10, t: 12, b: 26 };
  const bw = (W - pad.l - pad.r) / hours.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Arrivals and discharges per hour">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="grid" />
          <text x={pad.l - 6} y={y(max * f) + 4} className="axis" textAnchor="end">{Math.round(max * f)}</text>
        </g>
      ))}
      {hours.map((h, i) => {
        const x = pad.l + i * bw;
        const future = h > current;
        return (
          <g key={h} opacity={future ? 0.25 : 1}>
            <rect x={x + bw * 0.14} y={y(hourly.arrivals[h])} width={bw * 0.34} height={H - pad.b - y(hourly.arrivals[h])} rx="3" className="b-arr" />
            <rect x={x + bw * 0.52} y={y(hourly.discharges[h])} width={bw * 0.34} height={H - pad.b - y(hourly.discharges[h])} rx="3" className="b-dis" />
            <text x={x + bw / 2} y={H - 8} className={`axis ${h === current ? 'now' : ''}`} textAnchor="middle">{String(h).padStart(2, '0')}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PatientModal({ p, now, onClose, onAdvance, wardFull }) {
  if (!p) return null;
  const next = NEXT[p.stage];
  const blocked = p.stage === 'awaiting' && wardFull;
  const label = STAGES.find((s) => s.key === p.stage).label;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-id">{p.id}</div>
            <div className="modal-sub">{p.age} years, {p.sex === 'F' ? 'female' : 'male'} · {p.complaint}</div>
          </div>
          <span className="acuity-pill" style={{ background: ACUITY[p.acuity].color }}>{ACUITY[p.acuity].label}</span>
        </div>
        <div className="modal-grid">
          <div><span>Current step</span><strong>{label}</strong></div>
          <div><span>Time in step</span><strong>{duration(now - p.since)}</strong></div>
          <div><span>Time in hospital</span><strong>{duration(now - p.arrivedAt)}</strong></div>
          <div><span>Target ward</span><strong>{p.needsAdmission ? p.ward : 'Outpatient'}</strong></div>
        </div>
        <div className="timeline">
          {p.history.map((h, i) => (
            <div className="tl-row" key={i}>
              <span className="tl-dot" />
              <span className="tl-time">{clock(h.at)}</span>
              <span>{STAGES.find((s) => s.key === h.stage).label}</span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
          {next ? (
            <button className="btn primary" disabled={blocked} onClick={() => onAdvance(p.id)}>
              {blocked ? 'No free bed on ward' : `Move to ${STAGES.find((s) => s.key === next).label}`}
            </button>
          ) : (
            <button className="btn primary" onClick={() => onAdvance(p.id)}>Discharge patient</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [state, setState] = useState(buildInitial);
  const [live, setLive] = useState(true);
  const [openId, setOpenId] = useState(null);
  const rndRef = useRef(mulberry32(7));

  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => setState((s) => step(s, rndRef.current)), TICK_MS);
    return () => clearInterval(id);
  }, [live]);

  const { now, patients, wards } = state;

  const stats = useMemo(() => {
    const ed = patients.filter((p) => ED_STAGES.includes(p.stage));
    const avgEd = ed.length ? ed.reduce((a, p) => a + (now - p.arrivedAt), 0) / ed.length : 0;
    const boarding = patients.filter((p) => p.stage === 'awaiting');
    const beds = wards.reduce((a, w) => a + w.beds, 0);
    const occ = wards.reduce((a, w) => a + w.occupied, 0);
    const readyDischarge = patients.filter((p) => p.stage === 'discharge');
    const diagAdmit = patients.filter((p) => p.stage === 'diagnostics' && p.needsAdmission).length;
    const demand = boarding.length + diagAdmit;
    const supply = readyDischarge.length + Math.round(wards.length * 0.9);
    return { ed, avgEd, boarding, beds, occ, readyDischarge, demand, supply };
  }, [patients, wards, now]);

  const waitingByWard = useMemo(() => {
    const m = {};
    stats.boarding.forEach((p) => { m[p.ward] = (m[p.ward] || 0) + 1; });
    return m;
  }, [stats.boarding]);

  const alerts = useMemo(() => {
    const list = [];
    patients
      .filter((p) => p.stage === 'arrival' && p.acuity === 1)
      .forEach((p) => list.push({ level: 'crit', title: `${p.id} immediate priority`, text: `${p.complaint}, not yet triaged.` }));
    wards
      .filter((w) => w.occupied / w.beds >= 0.95 && waitingByWard[w.name])
      .forEach((w) => list.push({
        level: 'crit',
        title: `${w.name} full`,
        text: `${w.occupied}/${w.beds} beds, ${waitingByWard[w.name]} waiting in the ED.`,
      }));
    stats.boarding
      .filter((p) => now - p.since > 90)
      .sort((a, b) => a.since - b.since)
      .slice(0, 3)
      .forEach((p) => list.push({ level: 'high', title: `${p.id} boarding ${duration(now - p.since)}`, text: `Waiting for a ${p.ward} bed.` }));
    const slow = stats.readyDischarge.filter((p) => now - p.since > 45);
    if (slow.length) {
      list.push({
        level: 'info',
        title: `${slow.length} discharge${slow.length > 1 ? 's' : ''} delayed`,
        text: 'Ready to go home for more than 45 min. Prioritise transport and letters to free beds.',
      });
    }
    return list.slice(0, 6);
  }, [patients, wards, stats, waitingByWard, now]);

  const openPatient = patients.find((p) => p.id === openId) || null;
  const openWard = openPatient ? wards.find((w) => w.name === openPatient.ward) : null;

  function advance(id) {
    setState((s) => {
      const p = s.patients.find((x) => x.id === id);
      if (!p) return s;
      const next = NEXT[p.stage];
      const wardsCopy = s.wards.map((w) => ({ ...w }));
      const w = wardsCopy.find((x) => x.name === p.ward);
      const hour = Math.floor(s.now / 60) % 24;
      if (!next || (p.stage === 'diagnostics' && !p.needsAdmission)) {
        if (p.stage === 'discharge' && w) w.occupied = Math.max(0, w.occupied - 1);
        const hourly = { ...s.hourly, discharges: [...s.hourly.discharges] };
        hourly.discharges[hour] += 1;
        return {
          ...s,
          wards: wardsCopy,
          hourly,
          dischargedToday: s.dischargedToday + 1,
          patients: s.patients.filter((x) => x.id !== id),
          log: [{ at: s.now, text: `${id} discharged` }, ...s.log].slice(0, 40),
        };
      }
      if (next === 'ward') {
        if (!w || w.occupied >= w.beds) return s;
        w.occupied += 1;
      }
      return {
        ...s,
        wards: wardsCopy,
        admittedToday: next === 'ward' ? s.admittedToday + 1 : s.admittedToday,
        patients: s.patients.map((x) => (x.id === id ? moveTo(x, next, s.now) : x)),
        log: [{ at: s.now, text: `${id} moved to ${STAGES.find((st) => st.key === next).label}` }, ...s.log].slice(0, 40),
      };
    });
    setOpenId(null);
  }

  const occPct = Math.round((stats.occ / stats.beds) * 100);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">FlowBoard</div>
            <div className="brand-sub">Hospital patient flow, from arrival to discharge</div>
          </div>
        </div>
        <div className="top-right">
          <div className={`live ${live ? 'on' : ''}`}>
            <span className="live-dot" />
            {live ? 'Live' : 'Paused'}
          </div>
          <div className="clock">{clock(now)}</div>
          <button className="btn ghost" onClick={() => setLive((v) => !v)}>{live ? 'Pause' : 'Resume'}</button>
          <button className="btn warn" onClick={() => setState((s) => step(s, rndRef.current, 5))}>Simulate surge</button>
          <button className="btn ghost" onClick={() => { rndRef.current = mulberry32(7); setState(buildInitial()); }}>Reset</button>
        </div>
      </header>

      <section className="kpis">
        <Kpi label="Patients in ED" value={stats.ed.length} sub={`avg. ${duration(stats.avgEd)} since arrival`} tone={stats.ed.length > 20 ? 'bad' : ''} />
        <Kpi label="Waiting for a bed" value={stats.boarding.length} sub={`${stats.boarding.filter((p) => now - p.since > 60).length} longer than 1h`} tone={stats.boarding.length > 5 ? 'bad' : stats.boarding.length > 3 ? 'mid' : ''} />
        <Kpi label="Bed occupancy" value={`${occPct}%`} sub={`${stats.beds - stats.occ} of ${stats.beds} beds free`} tone={occPct >= 93 ? 'bad' : occPct >= 88 ? 'mid' : ''} />
        <Kpi label="Ready for discharge" value={stats.readyDischarge.length} sub="beds about to free up" tone="good" />
        <Kpi label="Admitted today" value={state.admittedToday} sub="from the ED" />
        <Kpi label="Discharged today" value={state.dischargedToday} sub="all wards" />
      </section>

      <main className="layout">
        <section className="board card">
          <div className="card-head">
            <h2>Patient journey</h2>
            <div className="legend">
              {Object.entries(ACUITY).map(([k, a]) => (
                <span key={k}><i style={{ background: a.color }} />{a.label}</span>
              ))}
            </div>
          </div>
          <div className="lanes">
            {STAGES.map((s) => {
              const list = patients
                .filter((p) => p.stage === s.key)
                .sort((a, b) => a.acuity - b.acuity || a.since - b.since);
              const late = s.target ? list.filter((p) => now - p.since > s.target).length : 0;
              return (
                <div className={`lane lane-${s.key}`} key={s.key}>
                  <div className="lane-head">
                    <span className="lane-title">{s.label}</span>
                    <span className="lane-count">{list.length}</span>
                  </div>
                  <div className="lane-target">
                    {s.target ? <>target {s.target} min{late > 0 && <b> · {late} over</b>}</> : 'admitted today'}
                  </div>
                  <div className="lane-body">
                    {list.map((p) => (
                      <PatientCard key={p.id} p={p} now={now} target={s.target} onOpen={setOpenId} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="side">
          <section className="card">
            <div className="card-head"><h2>Bed capacity</h2></div>
            <div className="wards">
              {wards.map((w) => <WardBar key={w.name} w={w} waiting={waitingByWard[w.name] || 0} />)}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Bottlenecks</h2>
              <span className="badge">{alerts.length}</span>
            </div>
            {alerts.length === 0 && <div className="empty">Flow is stable. No action needed.</div>}
            <div className="alerts">
              {alerts.map((a, i) => (
                <div className={`alert ${a.level}`} key={i}>
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-text">{a.text}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <section className="bottom">
        <div className="card">
          <div className="card-head">
            <h2>Arrivals vs. discharges today</h2>
            <div className="legend">
              <span><i className="l-arr" />Arrivals</span>
              <span><i className="l-dis" />Discharges</span>
            </div>
          </div>
          <FlowChart hourly={state.hourly} now={now} />
        </div>
        <div className="card forecast">
          <div className="card-head"><h2>Next 4 hours</h2></div>
          <div className="fc-row">
            <div className="fc-num">{stats.demand}</div>
            <div className="fc-label">beds needed<br /><small>boarding + likely admissions</small></div>
          </div>
          <div className="fc-row">
            <div className="fc-num green">{stats.supply}</div>
            <div className="fc-label">beds expected free<br /><small>ready discharges + typical turnover</small></div>
          </div>
          <div className={`fc-verdict ${stats.demand > stats.supply ? 'bad' : 'good'}`}>
            {stats.demand > stats.supply
              ? `Gap of ${stats.demand - stats.supply} beds. Start discharge rounds early.`
              : 'Capacity covers expected demand.'}
          </div>
        </div>
        <div className="card log">
          <div className="card-head"><h2>Activity</h2></div>
          <div className="log-list">
            {state.log.slice(0, 9).map((l, i) => (
              <div className="log-row" key={`${l.at}-${i}`}>
                <span className="log-time">{clock(l.at)}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="foot">
        Prototype built in one co-creation session. All patients and numbers are synthetic. No real patient data.
      </footer>

      <PatientModal
        p={openPatient}
        now={now}
        onClose={() => setOpenId(null)}
        onAdvance={advance}
        wardFull={openWard ? openWard.occupied >= openWard.beds : false}
      />
    </div>
  );
}
