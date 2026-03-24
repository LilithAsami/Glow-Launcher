/**
 * Party HTTP API for Taxi System
 *
 * All party operations against Epic's Party Service:
 * - Create / join / leave parties
 * - Member meta patches (cosmetics, stats, readiness)
 * - Party meta patches (privacy, playlist)
 * - Party chat via EOS REST API
 */

import axios from 'axios';
import { Endpoints } from '../../../helpers/endpoints';
import { defaultPartyMemberMeta } from '../../party/ClientPartyMemberMeta';

const BR_PARTY = Endpoints.BR_PARTY; // https://party-service-prod.ol.epicgames.com/party/api/v1/Fortnite
const EOS_CHAT = Endpoints.EOS_CHAT; // https://api.epicgames.dev/epic/chat

// ── Types ───────────────────────────────────────────────────

export interface PartyCreateResult {
  id: string;
  revision: number;
  members: any[];
  meta: Record<string, string>;
}

export interface PartyData {
  id: string;
  revision: number;
  members: any[];
  meta: Record<string, string>;
  config: any;
}

// ── Party Operations ────────────────────────────────────────

/**
 * Create a new party (called after login or after leaving a party)
 */
export async function createParty(
  token: string,
  accountId: string,
  displayName: string,
  xmppJid: string,
  platform = 'WIN',
): Promise<PartyCreateResult> {
  const res = await axios.post(
    `${BR_PARTY}/parties`,
    {
      config: {
        join_confirmation: false,
        joinability: 'OPEN',
        max_size: 16,
      },
      join_info: {
        connection: {
          id: xmppJid,
          meta: {
            'urn:epic:conn:platform_s': platform,
            'urn:epic:conn:type_s': 'game',
          },
          yield_leadership: false,
        },
        meta: {
          'urn:epic:member:dn_s': displayName,
        },
      },
      meta: {
        'urn:epic:cfg:party-type-id_s': 'default',
        'urn:epic:cfg:build-id_s': '1:3:',
        'urn:epic:cfg:join-request-action_s': 'Manual',
        'urn:epic:cfg:chat-enabled_b': 'true',
        'urn:epic:cfg:can-join_b': 'true',
        'urn:epic:cfg:accepting-members_b': 'true',
        'urn:epic:cfg:invite-perm_s': 'Anyone',
        'urn:epic:cfg:presence-perm_s': 'Anyone',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  return res.data;
}

/**
 * Get a party by ID
 */
export async function getParty(token: string, partyId: string): Promise<PartyData> {
  const res = await axios.get(`${BR_PARTY}/parties/${partyId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

/**
 * Get the current user's party
 */
export async function getUserParty(token: string, accountId: string): Promise<PartyData | null> {
  try {
    const res = await axios.get(`${BR_PARTY}/user/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = res.data?.current?.[0];
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Join an existing party by ID
 */
export async function joinParty(
  token: string,
  partyId: string,
  accountId: string,
  displayName: string,
  xmppJid: string,
  platform = 'WIN',
): Promise<void> {
  await axios.post(
    `${BR_PARTY}/parties/${partyId}/members/${accountId}/join`,
    {
      connection: {
        id: xmppJid,
        meta: {
          'urn:epic:conn:platform_s': platform,
          'urn:epic:conn:type_s': 'game',
        },
        yield_leadership: false,
      },
      meta: {
        'urn:epic:member:dn_s': displayName,
        'urn:epic:member:joinrequestusers_j': JSON.stringify({
          users: [
            {
              id: accountId,
              dn: displayName,
              plat: platform,
              data: JSON.stringify({
                CrossplayPreference: '1',
                SubGame_u: '1',
              }),
            },
          ],
        }),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );
}

/**
 * Leave a party
 */
export async function leaveParty(
  token: string,
  partyId: string,
  accountId: string,
): Promise<void> {
  await axios.delete(`${BR_PARTY}/parties/${partyId}/members/${accountId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Send a party member meta patch (cosmetics, stats, readiness, etc.)
 */
export async function patchMemberMeta(
  token: string,
  partyId: string,
  accountId: string,
  updated: Record<string, string>,
  revision: number,
): Promise<{ newRevision: number }> {
  try {
    await axios.patch(
      `${BR_PARTY}/parties/${partyId}/members/${accountId}/meta`,
      {
        delete: [],
        revision,
        update: updated,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return { newRevision: revision + 1 };
  } catch (e: any) {
    // Handle stale revision — retry with new revision
    const apiErr = e.response?.data;
    if (apiErr?.errorCode === 'errors.com.epicgames.social.party.stale_revision') {
      const correctRevision = parseInt(apiErr.messageVars?.[1], 10);
      if (!isNaN(correctRevision)) {
        return patchMemberMeta(token, partyId, accountId, updated, correctRevision);
      }
    }
    throw e;
  }
}

/**
 * Send the complete default member meta after joining a party.
 * This sets cosmetics, platform data, STW state, etc.
 */
export async function sendInitialMemberMeta(
  token: string,
  partyId: string,
  accountId: string,
): Promise<{ newRevision: number }> {
  return patchMemberMeta(token, partyId, accountId, { ...defaultPartyMemberMeta }, 0);
}

/**
 * Accept a party invite (PING) by resolving the ping and joining
 */
export async function acceptPartyInvite(
  token: string,
  accountId: string,
  senderId: string,
  displayName: string,
  xmppJid: string,
  platform = 'WIN',
): Promise<string> {
  // 1. Get parties from the ping
  const partyRes = await axios.get(
    `${BR_PARTY}/user/${accountId}/pings/${senderId}/parties`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  const partyData = partyRes.data;
  if (!Array.isArray(partyData) || partyData.length === 0 || !partyData[0].id) {
    throw new Error('No party found from ping');
  }

  const partyId = partyData[0].id;

  // 2. Delete ping (this tells backend to accept)
  await axios.delete(
    `${BR_PARTY}/user/${accountId}/pings/${senderId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  // 3. Join the party
  await joinParty(token, partyId, accountId, displayName, xmppJid, platform);

  return partyId;
}

/**
 * Decline a party invite (PING)
 */
export async function declinePartyInvite(
  token: string,
  accountId: string,
  senderId: string,
): Promise<void> {
  try {
    await axios.delete(
      `${BR_PARTY}/user/${accountId}/pings/${senderId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {}
}

/**
 * Send a party chat message (via EOS REST API)
 */
export async function sendPartyChatMessage(
  eosToken: string,
  partyId: string,
  accountId: string,
  memberIds: string[],
  message: string,
): Promise<void> {
  try {
    await axios.post(
      `${EOS_CHAT}/v1/public/Fortnite/conversations/p-${partyId}/messages?fromAccountId=${accountId}`,
      {
        allowedRecipients: memberIds,
        message: { body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${eosToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
  } catch {
    // Party chat is best-effort — silently fail
  }
}

// ── Meta Helpers (cosmetic setters) ─────────────────────────

/**
 * Build meta patch for setting outfit
 */
export function buildOutfitMeta(
  skinId: string,
  currentMeta: Record<string, string>,
): Record<string, string> {
  const loadout = JSON.parse(currentMeta['Default:AthenaCosmeticLoadout_j'] || '{"AthenaCosmeticLoadout":{}}');
  loadout.AthenaCosmeticLoadout.characterPrimaryAssetId = `AthenaCharacter:${skinId}`;
  loadout.AthenaCosmeticLoadout.scratchpad = [];

  return {
    'Default:AthenaCosmeticLoadout_j': JSON.stringify(loadout),
    'Default:AthenaCosmeticLoadoutVariants_j': JSON.stringify({
      AthenaCosmeticLoadoutVariants: { vL: { athenaCharacter: { i: [] } }, fT: false },
    }),
  };
}

/**
 * Build meta patch for setting banner + optional level
 */
export function buildBannerMeta(
  bannerId: string,
  color = 'defaultcolor15',
  level?: number,
  currentMeta?: Record<string, string>,
): Record<string, string> {
  const existing = currentMeta
    ? JSON.parse(currentMeta['Default:AthenaBannerInfo_j'] || '{"AthenaBannerInfo":{}}')
    : { AthenaBannerInfo: {} };

  existing.AthenaBannerInfo.bannerIconId = bannerId;
  existing.AthenaBannerInfo.bannerColorId = color;
  if (level !== undefined) {
    existing.AthenaBannerInfo.seasonLevel = level;
  }

  return { 'Default:AthenaBannerInfo_j': JSON.stringify(existing) };
}

/**
 * Build meta patch for setting level
 */
export function buildLevelMeta(
  level: number,
  currentMeta?: Record<string, string>,
): Record<string, string> {
  const existing = currentMeta
    ? JSON.parse(currentMeta['Default:AthenaBannerInfo_j'] || '{"AthenaBannerInfo":{}}')
    : { AthenaBannerInfo: {} };

  existing.AthenaBannerInfo.seasonLevel = level;
  return { 'Default:AthenaBannerInfo_j': JSON.stringify(existing) };
}

/**
 * Build meta patch for setting emote
 */
export function buildEmoteMeta(emoteId: string): Record<string, string> {
  const emotePath = `/Game/Athena/Items/Cosmetics/Dances/${emoteId}.${emoteId}`;
  return {
    'Default:FrontendEmote_j': JSON.stringify({
      FrontendEmote: {
        emoteItemDef: 'None',
        emoteItemDefEncryptionKey: '',
        emoteSection: -1,
        pickable: emotePath,
      },
    }),
  };
}

/**
 * Build meta patch for setting readiness
 */
export function buildReadinessMeta(ready: boolean): Record<string, string> {
  return {
    'Default:LobbyState_j': JSON.stringify({
      LobbyState: {
        inGameReadyCheckStatus: 'None',
        gameReadiness: ready ? 'Ready' : 'NotReady',
        readyInputType: ready ? 'MouseAndKeyboard' : 'Count',
        currentInputType: 'MouseAndKeyboard',
        hiddenMatchmakingDelayMax: 0,
        hasPreloadedAthena: false,
      },
    }),
  };
}
