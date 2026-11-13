export const publisher = 'ca-pub-9605920128105982';
export const origin = 'https://estudiemos.ar';

// Operational gates. Change only after site approval and the launch checklist.
export const review = Object.freeze({
  siteReady: false,
  consentAndAudienceVerified: false
});
export const placements = Object.freeze({
  week: Object.freeze({path:'/semana', slot:'', evaluated:false}),
  progress: Object.freeze({path:'/progreso', slot:'', evaluated:false})
});

export const inPilotAudience = user => user?.app_metadata?.estudiemos_ads_pilot_adult === true;

export function approvedPlacement(release, key, url, flags = review, inventory = placements) {
  if (release !== true || flags.siteReady !== true || flags.consentAndAudienceVerified !== true ||
      url.origin !== origin || url.search || (url.hash && url.hash !== '#contenido') ||
      !Object.hasOwn(inventory,key)) return null;
  const item = inventory[key];
  return item.evaluated === true && item.path === url.pathname && /^[0-9]{10}$/.test(item.slot) ? item : null;
}
