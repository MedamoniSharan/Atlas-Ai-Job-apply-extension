import type { Application } from '@cosmo/shared';
import type { TrackerColumn } from '../../lib/api';

export type ColumnId = TrackerColumn;

export type BoardMode = 'simple' | 'advanced';
export type SwimlaneMode = 'none' | 'company' | 'location';
export type BoardDensity = 'comfortable' | 'compact';

export type ColumnDef = {
  id: ColumnId;
  title: string;
  hint: string;
};

export const ALL_COLUMNS: ColumnDef[] = [
  { id: 'matched', title: 'Matched', hint: 'Matched from scan' },
  { id: 'applied', title: 'Applied', hint: 'Applied successfully' },
  { id: 'interview', title: 'Interview', hint: 'Interview stage' },
  { id: 'offer', title: 'Offer', hint: 'Offer received' },
  { id: 'rejected', title: 'Rejected', hint: 'Closed / rejected' },
  { id: 'skipped', title: 'Skipped', hint: 'Not applied' },
];

export const SIMPLE_COLUMN_IDS: ColumnId[] = [
  'matched',
  'applied',
  'skipped',
];

export const ADVANCED_COLUMN_IDS: ColumnId[] = ALL_COLUMNS.map((c) => c.id);

export type BoardPrefs = {
  mode: BoardMode;
  visibleColumns: ColumnId[];
  density: BoardDensity;
  swimlane: SwimlaneMode;
};

export const BOARD_PREFS_KEY = 'cosmo_tracker_board_v2';

export const DEFAULT_BOARD_PREFS: BoardPrefs = {
  mode: 'advanced',
  visibleColumns: [...ADVANCED_COLUMN_IDS],
  density: 'compact',
  swimlane: 'none',
};

export function columnFor(app: Application): ColumnId {
  if (app.metadata?.skipped) return 'skipped';
  if (app.status === 'interview') return 'interview';
  if (app.status === 'offer') return 'offer';
  if (app.status === 'rejected') return 'rejected';
  if (app.status === 'applied' || app.metadata?.source === 'auto_apply') {
    return 'applied';
  }
  return 'matched';
}

/** Optimistic local shape after a tracker move. */
export function applyColumnLocally(
  app: Application,
  column: ColumnId
): Application {
  const metadata = { ...(app.metadata ?? {}) };
  const clearSkip = () => {
    metadata.skipped = false;
    delete metadata.skipReason;
    metadata.companySiteApply = false;
  };

  if (column === 'applied') {
    clearSkip();
    return {
      ...app,
      status: 'applied',
      appliedAt: app.appliedAt ?? new Date().toISOString(),
      metadata: {
        ...metadata,
        source:
          metadata.source === 'auto_apply' || metadata.source === 'manual'
            ? metadata.source
            : metadata.source ?? 'manual',
      },
    };
  }
  if (column === 'matched') {
    clearSkip();
    return {
      ...app,
      status: 'detected',
      metadata: {
        ...metadata,
        source:
          metadata.source === 'auto_apply' ? 'auto_scan' : metadata.source,
      },
    };
  }
  if (column === 'interview') {
    clearSkip();
    return { ...app, status: 'interview', metadata: { ...metadata } };
  }
  if (column === 'offer') {
    clearSkip();
    return { ...app, status: 'offer', metadata: { ...metadata } };
  }
  if (column === 'rejected') {
    clearSkip();
    return { ...app, status: 'rejected', metadata: { ...metadata } };
  }
  return {
    ...app,
    status: app.status === 'applied' ? 'detected' : app.status,
    metadata: {
      ...metadata,
      skipped: true,
      skipReason: metadata.skipReason || 'Moved to Skipped',
      companySiteApply: false,
    },
  };
}

export function readBoardPrefs(): BoardPrefs {
  try {
    const raw = localStorage.getItem(BOARD_PREFS_KEY);
    if (!raw) return { ...DEFAULT_BOARD_PREFS };
    const parsed = JSON.parse(raw) as Partial<BoardPrefs>;
    const mode: BoardMode =
      parsed.mode === 'simple' || parsed.mode === 'advanced'
        ? parsed.mode
        : 'advanced';
    const density: BoardDensity =
      parsed.density === 'compact' ? 'compact' : 'comfortable';
    const swimlane: SwimlaneMode =
      parsed.swimlane === 'company' || parsed.swimlane === 'location'
        ? parsed.swimlane
        : 'none';
    const allowed = new Set(ADVANCED_COLUMN_IDS);
    let visibleColumns = Array.isArray(parsed.visibleColumns)
      ? parsed.visibleColumns.filter((id): id is ColumnId =>
          allowed.has(id as ColumnId)
        )
      : [...ADVANCED_COLUMN_IDS];
    if (mode === 'simple') {
      visibleColumns = [...SIMPLE_COLUMN_IDS];
    } else if (!visibleColumns.length) {
      visibleColumns = [...ADVANCED_COLUMN_IDS];
    }
    return { mode, visibleColumns, density, swimlane };
  } catch {
    return { ...DEFAULT_BOARD_PREFS };
  }
}

export function writeBoardPrefs(prefs: BoardPrefs): void {
  try {
    localStorage.setItem(BOARD_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function columnsForPrefs(prefs: BoardPrefs): ColumnDef[] {
  const ids =
    prefs.mode === 'simple'
      ? SIMPLE_COLUMN_IDS
      : prefs.visibleColumns.length
        ? prefs.visibleColumns
        : ADVANCED_COLUMN_IDS;
  const order = ALL_COLUMNS.map((c) => c.id);
  return ids
    .slice()
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((id) => ALL_COLUMNS.find((c) => c.id === id)!)
    .filter(Boolean);
}

export function swimlaneKey(
  app: Application,
  mode: SwimlaneMode
): string {
  if (mode === 'company') {
    return app.company?.trim() || 'Unknown company';
  }
  if (mode === 'location') {
    const loc = app.location?.split(',')[0]?.trim();
    return loc || 'Unknown location';
  }
  return 'All';
}

export function companyInitials(company: string): string {
  const parts = company.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function matchesTrackerFilters(
  app: Application,
  opts: {
    q: string;
    platform: string;
    salaryFilter: 'all' | 'disclosed' | 'undisclosed';
  }
): boolean {
  const q = opts.q.trim().toLowerCase();
  if (q) {
    const hay = `${app.title} ${app.company} ${app.location ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (opts.platform !== 'all' && app.platform !== opts.platform) return false;
  if (opts.salaryFilter === 'disclosed') {
    const sal = (app.salary || '').toLowerCase();
    if (!sal || /not\s*disclosed|undisclosed/.test(sal)) return false;
  }
  if (opts.salaryFilter === 'undisclosed') {
    const sal = (app.salary || '').toLowerCase();
    if (sal && !/not\s*disclosed|undisclosed/.test(sal)) return false;
  }
  return true;
}
