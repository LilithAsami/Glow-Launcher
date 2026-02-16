/**
 * MCP (Mission Control Protocol) helper
 * Executes profile operations against the Fortnite API.
 */

import axios from 'axios';
import { Endpoints } from '../helpers/endpoints';

export interface MCPOptions {
  profile: string;
  operation: string;
  accountId: string;
  accessToken: string;
  body?: any;
}

export async function composeMCP(options: MCPOptions): Promise<any> {
  const { profile, operation, accountId, accessToken, body = {} } = options;
  const url = `${Endpoints.MCP}/${accountId}/client/${operation}?profileId=${profile}&rvn=-1`;

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });

  return res.data;
}
