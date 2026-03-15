/**
 * Store — Epic Games Store: browse free games, search catalog.
 *
 * Uses the public Epic Games Store API (no auth required for free games)
 * and the authenticated catalog API for richer browsing.
 */

import axios from 'axios';

// ── Types ────────────────────────────────────────────────

export interface StoreGame {
  id: string;
  title: string;
  description: string;
  seller: string;
  images: { tall: string; wide: string; thumbnail: string };
  slug: string;
  originalPrice: string;
  currentPrice: string;
  isFree: boolean;
  freeUntil: string;       // ISO date or ''
  url: string;
}

// ── Free games API ────────────────────────────────────────

const FREE_GAMES_URL = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';

function extractImage(keyImages: any[], type: string): string {
  const img = keyImages?.find((i: any) => i.type === type);
  return img?.url || '';
}

function parseStoreItem(item: any): StoreGame | null {
  if (!item?.title) return null;

  const keyImages = item.keyImages || [];
  const tall = extractImage(keyImages, 'DieselStoreFrontTall')
    || extractImage(keyImages, 'OfferImageTall')
    || extractImage(keyImages, 'Thumbnail');
  const wide = extractImage(keyImages, 'DieselStoreFrontWide')
    || extractImage(keyImages, 'OfferImageWide')
    || extractImage(keyImages, 'Featured');
  const thumbnail = extractImage(keyImages, 'Thumbnail')
    || tall || wide;

  const price = item.price?.totalPrice;
  const originalPrice = price?.fmtPrice?.originalPrice || '';
  const currentPrice = price?.fmtPrice?.discountPrice || price?.fmtPrice?.originalPrice || '';
  const isFreeNow = price?.discountPrice === 0;

  // Check for active free promotion
  let freeUntil = '';
  const promos = item.promotions?.promotionalOffers?.[0]?.promotionalOffers;
  if (promos && promos.length > 0) {
    const promo = promos[0];
    if (promo.discountSetting?.discountPercentage === 0) {
      freeUntil = promo.endDate || '';
    }
  }

  // Build the store page URL
  const mappings = item.catalogNs?.mappings || item.offerMappings || [];
  const slug = mappings[0]?.pageSlug || item.productSlug || item.urlSlug || '';
  const url = slug
    ? `https://store.epicgames.com/p/${slug}`
    : `https://store.epicgames.com/browse?q=${encodeURIComponent(item.title)}`;

  return {
    id: item.id || '',
    title: item.title,
    description: item.description || '',
    seller: item.seller?.name || '',
    images: { tall, wide, thumbnail },
    slug,
    originalPrice,
    currentPrice,
    isFree: isFreeNow,
    freeUntil,
    url,
  };
}

/**
 * Get current and upcoming free games from the Epic Games Store.
 */
export async function getFreeGames(): Promise<{ success: boolean; current: StoreGame[]; upcoming: StoreGame[]; error?: string }> {
  try {
    const res = await axios.get(FREE_GAMES_URL, {
      params: { locale: 'en-US', country: 'US', allowCountries: 'US' },
      timeout: 15_000,
    });

    const elements = res.data?.data?.Catalog?.searchStore?.elements || [];

    const current: StoreGame[] = [];
    const upcoming: StoreGame[] = [];

    for (const elem of elements) {
      const game = parseStoreItem(elem);
      if (!game) continue;

      // Check if it has an active promotional offer (current free)
      const activePromos = elem.promotions?.promotionalOffers;
      const upcomingPromos = elem.promotions?.upcomingPromotionalOffers;

      if (activePromos && activePromos.length > 0 && activePromos[0].promotionalOffers?.length > 0) {
        current.push(game);
      } else if (upcomingPromos && upcomingPromos.length > 0) {
        upcoming.push(game);
      } else if (game.isFree) {
        current.push(game);
      }
    }

    return { success: true, current, upcoming };
  } catch (err: any) {
    return { success: false, current: [], upcoming: [], error: err?.message || 'Failed to fetch store data' };
  }
}
