import type { PageDefinition } from '../../shared/types';
import { accountsPage } from './accounts';
import { alertsPage } from './alerts';
import { autokickPage } from './autokick';
import { filesPage } from './files';
import { lockerPage } from './locker';
import { mcpPage } from './mcp';
import { securityPage } from './security';
import { settingsPage } from './settings';
import { stalkPage } from './stalk';
import { partyPage } from './party';
import { eulaPage } from './eula';
import { authPageDef } from './authPage';
import { statusPage } from './status';
import { taxiPage } from './taxi';
import { shopPage } from './shop';
import { ghostequipPage } from './ghostequip';
import { friendsPage } from './friends';

// ============================================================
//  PAGE REGISTRY  (sidebar pages only)
//
//  Home is NOT listed here — it's accessed via the logo
//  in the toolbar. Only sidebar pages go in this array.
//
//  To add a new page:
//    1. Create a file in this folder  (e.g. mypage.ts)
//    2. Export a PageDefinition object
//    3. Import it here and add it to the array below
//
//  Pages are sorted by `order`. Use position:'bottom'
//  to pin a page to the bottom of the sidebar.
// ============================================================

export const pages: PageDefinition[] = [
  alertsPage,
  friendsPage,
  lockerPage,
  shopPage,
  filesPage,
  mcpPage,
  stalkPage,
  partyPage,
  ghostequipPage,
  eulaPage,
  authPageDef,
  statusPage,
  taxiPage,
  securityPage,
  autokickPage,
  settingsPage,
].sort((a, b) => a.order - b.order);

// Pages accessible via toolbar/buttons but not in the sidebar
export const hiddenPages: PageDefinition[] = [
  accountsPage,
];
