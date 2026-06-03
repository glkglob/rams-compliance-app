'use client';

import { useState } from 'react';
import type { ReactNode, ReactElement } from 'react';

const TABS = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'project-setup', label: 'Project Setup' },
  { id: 'team',          label: 'Team & Roles' },
  { id: 'review',        label: 'Review Workflow' },
  { id: 'audit',         label: 'Audit Trail' },
] as const;

type TabId = typeof TABS[number]['id'];

function AppShell({ nav, children }: { nav: string; children: ReactNode }) {
  // Projects is the central workspace. Top-level nav: Dashboard | Projects | Organisation
  const items = ['Dashboard', 'Projects', 'Organisation'];
  return (
    <div className="flex min-h-[420px]">
      <nav className="hidden sm:flex w-44 shrink-0 flex-col border-r bg-muted/20 text-xs">
        <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </div>
        {items.map((item) => (
          <div
            key={item}
            className={
              'mx-2 mb-0.5 rounded px-3 py-1.5 font-medium ' +
              (item === nav ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')
            }
          >
            {item}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function DashboardMockup() {
  const rows = [
    { name: 'Road Works Phase 2',   status: 'Pending',  sc: 'text-yellow-700 bg-yellow-50 border-yellow-200', threshold: '80%', score: '75%', scoreCls: 'text-yellow-700' },
    { name: 'Scaffolding — Block A', status: 'Approved', sc: 'text-green-700 bg-green-50 border-green-200',   threshold: '75%', score: '82%', scoreCls: 'text-green-700'  },
    { name: 'Demolition RAMS v3',   status: 'Approved', sc: 'text-green-700 bg-green-50 border-green-200',   threshold: '70%', score: '91%', scoreCls: 'text-green-700'  },
    { name: 'Excavation Risk Plan', status: 'Pending',  sc: 'text-yellow-700 bg-yellow-50 border-yellow-200', threshold: '80%', score: '—',   scoreCls: 'text-muted-foreground' },
  ];
  return (
    <AppShell nav="Dashboard">
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[10px] text-muted-foreground">Good morning, M. Johnson</p>
          <p className="text-sm font-semibold">Dashboard Overview</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Projects',    value: '8',   sub: '+2 this month',         warn: false },
            { label: 'Pending Review',    value: '3',   sub: '2 flagged overdue',      warn: true  },
            { label: 'Approved',          value: '24',  sub: 'All time',               warn: false },
            { label: 'Compliance Rate',   value: '87%', sub: 'Across all projects',    warn: false },
          ].map(({ label, value, sub, warn }) => (
            <div key={label} className="space-y-1 rounded-lg border bg-card p-3">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className={'text-xl font-bold ' + (warn ? 'text-yellow-600' : '')}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-4 gap-2 bg-muted/30 px-3 py-2 text-[10px] font-semibold text-muted-foreground">
            <span>Project</span><span>Status</span><span>Threshold</span><span>Score</span>
          </div>
          {rows.map(({ name, status, sc, threshold, score, scoreCls }) => (
            <div key={name} className="grid grid-cols-4 items-center gap-2 border-t px-3 py-2 text-xs">
              <span className="truncate font-medium">{name}</span>
              <span className={'w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium ' + sc}>{status}</span>
              <span className="text-muted-foreground">{threshold}</span>
              <span className={'font-semibold ' + scoreCls}>{score}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function ProjectSetupMockup() {
  return (
    <AppShell nav="Projects">
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[10px] text-muted-foreground">Projects / New</p>
          <p className="text-sm font-semibold">Create New Project</p>
        </div>
        <div className="max-w-md space-y-3">
          {[
            { label: 'Project Name',   value: 'Road Works Phase 2'          },
            { label: 'Client Name',    value: 'Thames Infrastructure Ltd'   },
            { label: 'Site Location',  value: 'London, SE1'                 },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <p className="text-xs font-medium">{label}</p>
              <div className="rounded-md border bg-background px-3 py-2 text-xs text-foreground">{value}</div>
            </div>
          ))}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Compliance Threshold</p>
              <p className="text-sm font-bold text-primary">80%</p>
            </div>
            <div className="relative h-2 rounded-full bg-border">
              <div className="absolute left-0 top-0 h-2 rounded-l-full bg-primary" style={{ width: '80%' }} />
              <div
                className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow"
                style={{ left: 'calc(80% - 8px)' }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Submissions scoring below this threshold will require manual override to approve.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <div className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground">
              Save Project
            </div>
            <div className="rounded-md border px-4 py-1.5 text-xs font-medium text-muted-foreground">
              Cancel
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function TeamMockup() {
  const members = [
    { initials: 'MJ', name: 'M. Johnson',  email: 'm.johnson@company.com', role: 'Reviewer', rc: 'text-blue-700 bg-blue-50 border-blue-200'     },
    { initials: 'SC', name: 'S. Chen',      email: 's.chen@company.com',    role: 'Admin',    rc: 'text-purple-700 bg-purple-50 border-purple-200' },
    { initials: 'KP', name: 'K. Patel',    email: 'k.patel@company.com',   role: 'Reviewer', rc: 'text-blue-700 bg-blue-50 border-blue-200'      },
    { initials: 'TW', name: 'T. Williams', email: 't.w@company.com',       role: 'Viewer',   rc: 'text-muted-foreground bg-muted border-border'   },
  ];
  return (
    <AppShell nav="Projects">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground">Projects / Road Works Ph.2</p>
            <p className="text-sm font-semibold">Team &amp; Access</p>
          </div>
          <div className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            + Invite Member
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-3 gap-2 bg-muted/30 px-3 py-2 text-[10px] font-semibold text-muted-foreground">
            <span>Member</span><span>Role</span><span>Status</span>
          </div>
          {members.map(({ initials, name, email, role, rc }) => (
            <div key={name} className="grid grid-cols-3 items-center gap-2 border-t px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{email}</p>
                </div>
              </div>
              <span className={'w-fit rounded-full border px-2 py-0.5 text-[10px] font-medium ' + rc}>{role}</span>
              <span className="text-[10px] font-medium text-green-600">Active</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function ReviewMockup() {
  return (
    <AppShell nav="Projects">
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[10px] text-muted-foreground">Projects / Road Works Ph.2 / Submissions</p>
            <p className="text-sm font-semibold">Method Statement — Rev 3</p>
          </div>
          <span className="rounded-full border border-yellow-300 bg-yellow-50 px-2.5 py-0.5 text-[10px] font-semibold text-yellow-700">
            Pending Review
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="font-medium text-green-600">✓ Submitted</span>
          <div className="h-px flex-1 bg-green-400" />
          <span className="font-semibold text-primary">● Under Review</span>
          <div className="h-px flex-1 border-t border-dashed border-border" />
          <span className="text-muted-foreground">○ Decided</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground">Compliance Score</p>
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <svg viewBox="0 0 64 64" className="h-12 w-12 -rotate-90">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
                  <circle
                    cx="32" cy="32" r="26" fill="none"
                    stroke="hsl(var(--primary))" strokeWidth="7"
                    strokeDasharray="163.4" strokeDashoffset="40.85"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center rotate-90 text-xs font-bold">75%</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Score</span><span className="font-semibold">75 / 100</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Threshold</span><span className="font-semibold">80%</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Status</span><span className="font-semibold text-yellow-700">Below</span></div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-[10px] font-medium">Reviewer notes</p>
              <div className="min-h-[52px] rounded border bg-background px-2.5 py-2 text-[10px] italic text-muted-foreground">
                Section 4 does not reference the site rescue plan. Resubmit with appendix C.
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1 rounded border-2 border-green-500/40 bg-green-50/50 py-1 text-center text-[10px] font-semibold text-green-700">Approve</div>
              <div className="flex-1 rounded border-2 border-red-400/40 bg-red-50/50 py-1 text-center text-[10px] font-semibold text-red-700">Reject</div>
              <div className="flex-1 rounded border py-1 text-center text-[10px] font-medium text-muted-foreground">Override</div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function AuditMockup() {
  const events = [
    { dot: 'bg-blue-500',   action: 'Submission created',          actor: 'J. Smith',          time: '09:14', note: null },
    { dot: 'bg-gray-300',   action: 'Document text extracted',     actor: 'System',             time: '09:14', note: null },
    { dot: 'bg-blue-500',   action: 'Assigned to reviewer',        actor: 'M. Johnson',        time: '09:16', note: null },
    { dot: 'bg-yellow-500', action: 'Review notes added',          actor: 'M. Johnson',        time: '10:02', note: 'Section 4 missing rescue plan reference.' },
    { dot: 'bg-orange-500', action: 'Override requested',          actor: 'M. Johnson',        time: '10:05', note: null },
    { dot: 'bg-green-500',  action: 'Override approved',           actor: 'S. Chen (Admin)',   time: '10:47', note: null },
    { dot: 'bg-green-500',  action: 'Status updated to Approved',  actor: 'System',             time: '10:47', note: null },
  ];
  return (
    <AppShell nav="Projects">
      <div className="space-y-4 p-5">
        <div>
          <p className="text-[10px] text-muted-foreground">Projects / Road Works Ph.2</p>
          <p className="text-sm font-semibold">Audit Trail</p>
        </div>
        <div className="relative space-y-0 pl-5">
          <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
          {events.map(({ dot, action, actor, time, note }, i) => (
            <div key={i} className="relative flex gap-3 pb-3 last:pb-0">
              <div className={'-ml-5 relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ' + dot} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-xs font-medium">{action}</p>
                  <p className="text-[10px] text-muted-foreground">{actor} · Today {time}</p>
                </div>
                {note && (
                  <p className="mt-0.5 border-l-2 border-border pl-2 text-[10px] italic text-muted-foreground">{note}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

const MOCKUPS: Record<TabId, () => ReactElement> = {
  'dashboard':     DashboardMockup,
  'project-setup': ProjectSetupMockup,
  'team':          TeamMockup,
  'review':        ReviewMockup,
  'audit':         AuditMockup,
};

const CAPTIONS: Record<TabId, string> = {
  'dashboard':     'Active projects, review metrics, and compliance statistics at a glance.',
  'project-setup': 'Create a project, set client details, and define the compliance threshold.',
  'team':          'Invite team members and assign role-based access permissions.',
  'review':        'Step through a RAMS review: run AI gap analysis, then score/notes + human approve/reject/override with audit.',
  'audit':         'Complete timestamped history of every decision and status change.',
};

export function ProductShowcase() {
  const [active, setActive] = useState<TabId>('dashboard');
  const ActiveMockup = MOCKUPS[active];

  return (
    <div className="space-y-3">
      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={
              'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
              (active === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mockup window */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
          <span className="h-3 w-3 rounded-full bg-red-400/70" />
          <span className="h-3 w-3 rounded-full bg-yellow-400/70" />
          <span className="h-3 w-3 rounded-full bg-green-400/70" />
          <span className="mx-auto text-xs font-medium text-muted-foreground">
            RAMS Compliance — {TABS.find((t) => t.id === active)?.label}
          </span>
          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground shrink-0">
            Illustrative mockup
          </span>
        </div>

        {/* Active view */}
        <ActiveMockup />
      </div>

      {/* Caption */}
      <p className="text-center text-sm text-muted-foreground">{CAPTIONS[active]}</p>
    </div>
  );
}
