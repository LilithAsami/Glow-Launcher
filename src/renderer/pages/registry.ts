import type { PageDefinition } from '../../shared/types';
import { accountsPage } from './accounts';
import { alertsPage } from './alerts';
import { autokickPage } from './autokick';
import { expeditionsPage } from './expeditions';
import { filesPage } from './files';
import { dupePage } from './dupe';
import { vbucksPage } from './vbucks';
import { epicStatusPage } from './epicstatus';
import { lockerPage } from './locker';
import { mcpPage } from './mcp';
import { settingsPage } from './settings';
import { stalkPage } from './stalk';
import { partyPage } from './party';
import { authPageDef } from './authPage';
import { statusPage } from './status';
import { taxiPage } from './taxi';
import { shopPage } from './shop';
import { ghostequipPage } from './ghostequip';
import { friendsPage } from './friends';
import { redeemCodesPage } from './redeemcodes';
import { xpBoostsPage } from './xpboosts';
import { questsPage } from './quests';
import { autodailyPage } from './autodaily';
import { autoresponderPage } from './autoresponder';
import { outpostPage } from './outpost';
import { llamasPage } from './llamas';
import { epicAccountPage } from './epicaccount';
import { giftsPage } from './gifts';
import { fnlaunchPage } from './fnlaunch';
import { libraryPage } from './library';

// ============================================================
//  PAGE REGISTRY  (sidebar pages only)
//
//  Home is NOT listed here — it's accessed via the logo
//  in the toolbar. Only sidebar pages go in this array.
//
//  To add a new page:
//    1. Create a file in this folder 
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
    label: 'STW',
    pages: [
      alertsPage,
      llamasPage,
      questsPage,
      dupePage,
      partyPage,
      xpBoostsPage,
      stalkPage,
      outpostPage,
    ],
  },
  {
    label: 'AUTOMATED SYSTEMS',
    pages: [
      filesPage,
      taxiPage,
      autokickPage,
      autodailyPage,
      expeditionsPage,
      statusPage,
      autoresponderPage,
    ],
  },
  {
    label: 'EPIC GAMES',
    pages: [
      friendsPage,
      epicAccountPage,
      epicStatusPage,
      redeemCodesPage,
    ],
  },
  {
    label: 'BR',
    pages: [
      shopPage,
      lockerPage,
      vbucksPage,
      giftsPage,
      ghostequipPage,
    ],
  },
    {
    label: 'UTILITY',
    pages: [
      fnlaunchPage,
      mcpPage,
      authPageDef,
      libraryPage,
    ],
  },
];

// Flat array for the router — all sidebar pages + settings (hidden, accessed via toolbar)
export const pages: PageDefinition[] = [
  ...sidebarGroups.flatMap((g) => g.pages),
  settingsPage,
];

// Pages accessible via toolbar/buttons but not in the sidebar
export const hiddenPages: PageDefinition[] = [
  accountsPage,
];
