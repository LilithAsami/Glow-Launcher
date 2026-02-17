/**
 * Epic Status – Fetch and aggregate Epic Games service status.
 *
 * Sources:
 *   • Lightswitch public API   (Fortnite operational status – needs auth)
 *   • status.epicgames.com     (overall status, components, incidents)
 *
 * All responses are normalised into English-only data structures.
 * Components are organised into groups with their sub-components.
 */

import axios from 'axios';
import { Endpoints } from '../endpoints';
import { refreshAccountToken, authenticatedRequest } from '../auth/tokenRefresh';
import type { Storage } from '../../storage';
import type { AccountsData } from '../../../shared/types';

// ── Public types ──────────────────────────────────────────────

export interface LightswitchStatus {
  serviceInstanceId: string;
  status: string;
  message: string;
  maintenanceUri: string | null;
  allowedActions: string[];
  banned: boolean;
  launcherInfoDTO: {
    appName: string;
    catalogItemId: string;
    namespace: string;
  } | null;
}

export interface EpicSubComponent {
  id: string;
  name: string;
  status: string;
}

export interface EpicComponentGroup {
  id: string;
  name: string;
  status: string;
  position: number;
  children: EpicSubComponent[];
}

export interface EpicStandaloneComponent {
  id: string;
  name: string;
  status: string;
  position: number;
}

export interface EpicIncident {
  id: string;
  name: string;
  status: string;
  impact: string;
  shortlink: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  updates: {
    id: string;
    status: string;
    body: string;
    createdAt: string;
  }[];
}

export interface EpicStatusData {
  success: boolean;
  lightswitch: LightswitchStatus | null;
  lightswitchError: string | null;
  overallStatus: string;
  overallIndicator: string;
  /** Grouped components (group header + children) */
  groups: EpicComponentGroup[];
  /** Standalone components (no group) */
  standalone: EpicStandaloneComponent[];
  incidents: EpicIncident[];
  roadmap: {
    operational: number;
    degraded: number;
    partialOutage: number;
    majorOutage: number;
    maintenance: number;
    total: number;
  };
  error?: string;
}

// ── Fortnite-related group IDs (resolved at fetch time) ──────

const FORTNITE_GROUP_NAMES = [
  'fortnite',
  'lego fortnite',
  'fortnite festival',
  'rocket racing',
  'uefn',
];

function isFortniteGroup(name: string): boolean {
  return FORTNITE_GROUP_NAMES.includes(name.toLowerCase());
}

// ── Fetch lightswitch (needs auth) ────────────────────────────

async function fetchLightswitch(storage: Storage): Promise<{ data: LightswitchStatus | null; error: string | null }> {
  try {
    const raw = (await storage.get<AccountsData>('accounts')) ?? { tosAccepted: false, accounts: [] };
    const main = raw.accounts.find((a) => a.isMain) ?? raw.accounts[0];

    if (!main) return fetchLightswitchPublic();

    const token = await refreshAccountToken(storage, main.accountId);
    if (!token) return fetchLightswitchPublic();

    const { data } = await authenticatedRequest(storage, main.accountId, token, async (t) => {
      const res = await axios.get(Endpoints.LIGHTSWITCH_STATUS, {
        headers: { Authorization: `bearer ${t}` },
        timeout: 10_000,
      });
      return res.data;
    });

    return { data: data as LightswitchStatus, error: null };
  } catch {
    return fetchLightswitchPublic();
  }
}

async function fetchLightswitchPublic(): Promise<{ data: LightswitchStatus | null; error: string | null }> {
  try {
    const res = await axios.get(Endpoints.LIGHTSWITCH_STATUS, { timeout: 10_000 });
    return { data: res.data as LightswitchStatus, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Lightswitch unavailable' };
  }
}

// ── Fetch status page data (public, no auth) ─────────────────

async function fetchOverallStatus(): Promise<{ indicator: string; description: string }> {
  try {
    const res = await axios.get(Endpoints.EPIC_STATUS_PAGE, { timeout: 10_000 });
    const st = res.data?.status;
    return {
      indicator: st?.indicator || 'none',
      description: st?.description || 'All Systems Operational',
    };
  } catch {
    return { indicator: 'unknown', description: 'Unable to fetch status' };
  }
}

interface RawComponentsResult {
  groups: EpicComponentGroup[];
  standalone: EpicStandaloneComponent[];
  allStatuses: string[];
}

async function fetchComponents(): Promise<RawComponentsResult> {
  const empty: RawComponentsResult = { groups: [], standalone: [], allStatuses: [] };
  try {
    const res = await axios.get(Endpoints.EPIC_COMPONENTS, { timeout: 10_000 });
    const comps: any[] = res.data?.components || [];

    // Build group map: group_id -> group header
    const groupMap = new Map<string, EpicComponentGroup>();
    const allStatuses: string[] = [];

    // First pass: identify group headers
    for (const c of comps) {
      if (c.group === true && c.name !== 'Anchor') {
        groupMap.set(c.id, {
          id: c.id,
          name: c.name,
          status: c.status,
          position: c.position || 0,
          children: [],
        });
        allStatuses.push(c.status);
      }
    }

    // Second pass: assign sub-components to their groups
    for (const c of comps) {
      if (c.group || c.name === 'Anchor') continue;
      if (c.group_id && groupMap.has(c.group_id)) {
        groupMap.get(c.group_id)!.children.push({
          id: c.id,
          name: c.name,
          status: c.status,
        });
        allStatuses.push(c.status);
      } else if (!c.group_id) {
        // Standalone component (no group)
        empty.standalone.push({
          id: c.id,
          name: c.name,
          status: c.status,
          position: c.position || 0,
        });
        allStatuses.push(c.status);
      }
    }

    // Sort children within each group by position (already ordered in API)
    const groups = Array.from(groupMap.values()).sort((a, b) => a.position - b.position);
    const standalone = empty.standalone.sort((a, b) => a.position - b.position);

    return { groups, standalone, allStatuses };
  } catch {
    return empty;
  }
}

async function fetchIncidents(): Promise<EpicIncident[]> {
  try {
    const res = await axios.get(Endpoints.EPIC_INCIDENTS, { timeout: 10_000 });
    const incidents = res.data?.incidents || [];

    return incidents
      .filter((i: any) => !i.resolved_at)
      .map((i: any) => ({
        id: i.id,
        name: i.name,
        status: i.status,
        impact: i.impact || 'none',
        shortlink: i.shortlink || '',
        createdAt: i.created_at,
        updatedAt: i.updated_at,
        resolvedAt: i.resolved_at,
        updates: (i.incident_updates || []).map((u: any) => ({
          id: u.id,
          status: u.status,
          body: u.body || '',
          createdAt: u.created_at,
        })),
      }));
  } catch {
    return [];
  }
}

// ── Main export ───────────────────────────────────────────────

export async function getEpicStatus(storage: Storage): Promise<EpicStatusData> {
  const [lightswitchResult, overall, componentsResult, incidents] = await Promise.all([
    fetchLightswitch(storage),
    fetchOverallStatus(),
    fetchComponents(),
    fetchIncidents(),
  ]);

  const { groups, standalone, allStatuses } = componentsResult;

  // Compute roadmap from ALL statuses
  const roadmap = {
    operational: 0,
    degraded: 0,
    partialOutage: 0,
    majorOutage: 0,
    maintenance: 0,
    total: allStatuses.length,
  };

  for (const s of allStatuses) {
    switch (s) {
      case 'operational':           roadmap.operational++; break;
      case 'degraded_performance':  roadmap.degraded++; break;
      case 'partial_outage':        roadmap.partialOutage++; break;
      case 'major_outage':          roadmap.majorOutage++; break;
      case 'under_maintenance':     roadmap.maintenance++; break;
      default:                      roadmap.operational++; break;
    }
  }

  return {
    success: true,
    lightswitch: lightswitchResult.data,
    lightswitchError: lightswitchResult.error,
    overallStatus: overall.description,
    overallIndicator: overall.indicator,
    groups,
    standalone,
    incidents,
    roadmap,
  };
}
