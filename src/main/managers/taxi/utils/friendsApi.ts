/**
 * Friends HTTP API for Taxi System
 *
 * Accept / decline friend requests and query friend data.
 */

import axios from 'axios';
import { Endpoints } from '../../../helpers/endpoints';

const FRIENDS_BASE = Endpoints.FRIENDS; // https://friends-public-service-prod.ol.epicgames.com/friends/api/v1

/**
 * Accept a friend request (or send one if none exists)
 */
export async function acceptFriendRequest(
  token: string,
  accountId: string,
  friendId: string,
): Promise<void> {
  await axios.post(
    `${FRIENDS_BASE}/${accountId}/friends/${friendId}`,
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

/**
 * Decline / remove a friend
 */
export async function declineFriendRequest(
  token: string,
  accountId: string,
  friendId: string,
): Promise<void> {
  await axios.delete(
    `${FRIENDS_BASE}/${accountId}/friends/${friendId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

/**
 * Get friends summary (friends, incoming, outgoing, blocked)
 */
export async function getFriendsSummary(
  token: string,
  accountId: string,
): Promise<{
  friends: Array<{ accountId: string; displayName: string }>;
  incoming: Array<{ accountId: string; displayName: string }>;
  outgoing: Array<{ accountId: string; displayName: string }>;
}> {
  const res = await axios.get(
    `${FRIENDS_BASE}/${accountId}/summary`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.data;
}

/**
 * Get a friend's presence data (requires friends list access)
 */
export async function getFriendPresence(
  token: string,
  accountId: string,
  friendId: string,
): Promise<any> {
  try {
    const res = await axios.get(
      `${FRIENDS_BASE}/${accountId}/friends/${friendId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return res.data;
  } catch {
    return null;
  }
}
