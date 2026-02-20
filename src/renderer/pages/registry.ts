import type { PageDefinition } from '../../shared/types';
import { accountsPage } from './accounts';
import { alertsPage } from './alerts';
import { autokickPage } from './autokick';
import { filesPage } from './files';
import { dupePage } from './dupe';
import { vbucksPage } from './vbucks';
import { epicStatusPage } from './epicstatus';
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
import { redeemCodesPage } from './redeemcodes';
import { xpBoostsPage } from './xpboosts';
import { accountMgmtPage } from './accountmgmt';

// ============================================================
//  PAGE REGISTRY  (sidebar pages only)
//
//  Home is NOT listed here — it's accessed via the logo
//  in the toolbar. Only sidebar pages go in this array.
//
//  To add a new page:
//    1. Create a file in this folder  (e.g. mypage.ts)
//    2. Export a PageDefinition object
//    3. Import it here and add it to the correct group below
//
//  Pages within each group are displayed in the order listed.
//  Use position:'bottom' to pin a page to the bottom of the sidebar.
// ============================================================

export interface SidebarGroup {
  label: string;
  pages: PageDefinition[];
}

export const sidebarGroups: SidebarGroup[] = [
  {
    label: 'BR-STW',
    pages: [
      shopPage,
      lockerPage,
      alertsPage,
      dupePage,
      vbucksPage,
      ghostequipPage,
      partyPage,
      xpBoostsPage,
      mcpPage,
      stalkPage,
    ],
  },
  {
    label: 'Automated Systems',
    pages: [
      filesPage,
      taxiPage,
      autokickPage,
      statusPage,
    ],
  },
  {
    label: 'Epic Games',
    pages: [
      friendsPage,
      securityPage,
      epicStatusPage,
      eulaPage,
      redeemCodesPage,
      accountMgmtPage,
      authPageDef,
    ],
  },
];

// Flat array for the router — all sidebar pages + settings at the bottom
export const pages: PageDefinition[] = [
  ...sidebarGroups.flatMap((g) => g.pages),
  settingsPage,
];

// Pages accessible via toolbar/buttons but not in the sidebar
export const hiddenPages: PageDefinition[] = [
  accountsPage,
];
