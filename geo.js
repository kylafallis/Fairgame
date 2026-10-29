/* ================================================================
   FairGame - geo.js
   Location picker, ZIP lookup, and distance math for the judge network.

   Everything runs off static files in /data/geo, built once from the
   ZIP centroid data the `zipcodes` npm package ships (BSD licence):
     zip3.json       first three ZIP digits -> state(s)
     regions.json    US states/territories and Canadian provinces, each
                     with a typical-location point for state-level pins
     us/<ST>.json    { c: [[city, lat, lng]...], z: { zip: [lat, lng, cityIdx] } }
     ca.json         { z: { FSA: [lat, lng, province] } }
   No geocoding API, no key, nothing to rate-limit a sign-up push.

   Load before any page script that calls FG_GEO.
   ================================================================ */

(function () {
  'use strict';

  const BASE = '/data/geo/';

  /* ISO 3166-1 alpha-2. Names come from the browser so they read in the
     visitor's own spelling; the codes are what gets stored. */
  const COUNTRY_CODES = ['AF','AL','DZ','AD','AO','AG','AR','AM','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BT','BO','BA','BW','BR','BN','BG','BF','BI','CV','KH','CM','CA','CF','TD','CL','CN','CO','KM','CG','CD','CR','CI','HR','CU','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FJ','FI','FR','GA','GM','GE','DE','GH','GR','GD','GT','GN','GW','GY','HT','HN','HK','HU','IS','IN','ID','IR','IQ','IE','IL','IT','JM','JP','JO','KZ','KE','KI','KW','KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MO','MG','MW','MY','MV','ML','MT','MH','MR','MU','MX','FM','MD','MC','MN','ME','MA','MZ','MM','NA','NR','NP','NL','NZ','NI','NE','NG','KP','MK','NO','OM','PK','PW','PS','PA','PG','PY','PE','PH','PL','PT','QA','RO','RU','RW','KN','LC','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG','SK','SI','SB','SO','ZA','KR','SS','ES','LK','SD','SR','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TO','TT','TN','TR','TM','TV','UG','UA','AE','GB','US','UY','UZ','VU','VA','VE','VN','YE','ZM','ZW'];

  /* Countries the picker has a state/province list and coordinates for. */
  const MAPPED = ['US', 'CA'];

  const _cache = {};
  function fetchJSON(path) {
    if (!_cache[path]) {
      _cache[path] = fetch(BASE + path)
        .then(r => { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); })
        .catch(e => { delete _cache[path]; throw e; });
    }
    return _cache[path];
  }

  let _countryNames = null;
  function countryName(code) {
    if (!code) return '';
    try {
      _countryNames = _countryNames || new Intl.DisplayNames(['en'], { type: 'region' });
      return _countryNames.of(code) || code;
    } catch (_) { return code; }
  }

  /* US and Canada first, since that is where nearly everyone will be. */
  function countries() {
    const rest = COUNTRY_CODES.filter(c => !MAPPED.includes(c))
      .map(code => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...MAPPED.map(code => ({ code, name: countryName(code) })), ...rest];
  }

  async function regions(country) {
    if (!MAPPED.includes(country)) return [];
    const all = await fetchJSON('regions.json');
    return (all[country] || []).map(([code, name, lat, lng]) => ({ code, name, lat, lng }));
  }

  async function region(country, code) {
    return (await regions(country)).find(r => r.code === code) || null;
  }

  async function usState(code) {
    if (!code || !/^[A-Z]{2}$/.test(code)) return null;
    try { return await fetchJSON('us/' + code + '.json'); }
    catch (_) { return null; }
  }

  async function cities(country, state) {
    if (country !== 'US') return [];
    const d = await usState(state);
    return d ? d.c.map(c => c[0]) : [];
  }

  function normZip(country, raw) {
    const s = String(raw || '').trim().toUpperCase();
    if (country === 'US') { const m = s.match(/^(\d{5})(-?\d{4})?$/); return m ? m[1] : null; }
    if (country === 'CA') { const m = s.replace(/\s+/g, '').match(/^([A-Z]\d[A-Z])(\d[A-Z]\d)?$/); return m ? m[1] + (m[2] ? ' ' + m[2] : '') : null; }
    return s || null;
  }

  /* A US ZIP is unique nationally, but the files are split by state.
     zip3.json maps the first three digits to the one (occasionally two
     or three) states that use them; trying the selected state first
     means the common case costs one file. */
  async function statesForZip(zip) {
    const idx = await fetchJSON('zip3.json').catch(() => ({}));
    return idx[zip.slice(0, 3)] || [];
  }

  /* -> { country, state, city, lat, lng } or null */
  async function lookupZip(country, raw, preferState) {
    const zip = normZip(country, raw);
    if (!zip) return null;
    if (country === 'US') {
      const order = [...new Set([preferState, ...(await statesForZip(zip))].filter(Boolean))];
      for (const st of order) {
        const d = await usState(st);
        const hit = d?.z[zip];
        if (hit) return { country, state: st, city: d.c[hit[2]]?.[0] || '', lat: hit[0], lng: hit[1], zip };
      }
      return null;
    }
    if (country === 'CA') {
      const d = await fetchJSON('ca.json').catch(() => null);
      const hit = d?.z[zip.slice(0, 3)];
      return hit ? { country, state: hit[2], city: '', lat: hit[0], lng: hit[1], zip } : null;
    }
    return null;
  }

  async function lookupCity(country, state, city) {
    if (country !== 'US' || !city) return null;
    const d = await usState(state);
    if (!d) return null;
    const want = city.trim().toLowerCase().replace(/^(st\.?|saint)\s+/, 'st ');
    const hit = d.c.find(c => c[0].toLowerCase().replace(/^(st\.?|saint)\s+/, 'st ') === want);
    return hit ? { name: hit[0], lat: hit[1], lng: hit[2] } : null;
  }

  /* Best point for a location, most precise first: postal code, then
     city, then the state's typical location. source records which one
     was used, so the admin map can say how far to trust a pin. */
  async function resolve({ country, state, city, zip }) {
    country = country || 'US';
    if (zip) {
      const z = await lookupZip(country, zip, state);
      if (z && (!state || z.state === state)) return { lat: z.lat, lng: z.lng, source: 'zip', state: z.state, city: z.city };
    }
    if (city && state) {
      const c = await lookupCity(country, state, city);
      if (c) return { lat: c.lat, lng: c.lng, source: 'city', state, city: c.name };
    }
    if (state) {
      const r = await region(country, state);
      if (r) return { lat: r.lat, lng: r.lng, source: 'state', state };
    }
    return null;
  }

  /* For judges who signed up on the old free-text form: city held
     "Columbus, Franklin County" and state_code was backfilled to OH. */
  async function resolveJudge(j) {
    if (j.latitude != null && j.longitude != null) {
      return { lat: +j.latitude, lng: +j.longitude, source: j.geocode_source || 'saved' };
    }
    const country = j.country || 'US';
    const cityPart = (j.city || '').split(',')[0].trim();
    return resolve({ country, state: j.state_code || null, city: cityPart, zip: j.postal_code || null });
  }

  function milesBetween(a, b) {
    if (!a || !b) return null;
    const R = 3958.7613, rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* "Columbus, OH" for new rows; legacy rows already carry a phrase. */
  function label(j) {
    const city = (j.city || '').trim();
    const country = j.country || 'US';
    const st = j.state_code || j.region || '';
    const tail = country === 'US' || country === 'CA' ? st : [st, countryName(country)].filter(Boolean).join(', ');
    if (!city) return tail || '–';
    if (!tail || city.toUpperCase().endsWith(', ' + st)) return city;
    return city + ', ' + tail;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── The picker ────────────────────────────────────────────────
     Country, then state/province, then optional city and postal code.
     Typing a ZIP fills in the state and city, which is how most people
     will use it. Mounts into an empty element:

       const loc = FG_GEO.mountPicker(el, { prefix: 'j' });
       const { ok, error, value } = await loc.read();
       loc.set({ country, state_code, city, postal_code });

     Field ids are <prefix>Country, <prefix>State, <prefix>Region,
     <prefix>City and <prefix>Zip, so a page can still style or focus
     them directly. */
  function mountPicker(el, opts = {}) {
    const p = opts.prefix || 'loc';
    const required = opts.requireState !== false;
    el.classList.add('fg-loc');
    el.innerHTML = `
      <div class="fg-loc-row">
        <label class="${opts.labelClass || 'form-label'}" for="${p}Country">Country *</label>
        <select id="${p}Country">${countries().map(c => `<option value="${c.code}">${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="fg-loc-row">
        <label class="${opts.labelClass || 'form-label'}" for="${p}State" id="${p}StateLabel">State *</label>
        <select id="${p}State"><option value="">Loading…</option></select>
        <input type="text" id="${p}Region" placeholder="State, province, or region (optional)" style="display:none;" />
      </div>
      <div class="fg-loc-pair">
        <div class="fg-loc-row">
          <label class="${opts.labelClass || 'form-label'}" for="${p}City">City <span class="fg-loc-opt">(optional)</span></label>
          <input type="text" id="${p}City" list="${p}CityList" autocomplete="off" placeholder="Start typing…" />
          <datalist id="${p}CityList"></datalist>
        </div>
        <div class="fg-loc-row">
          <label class="${opts.labelClass || 'form-label'}" for="${p}Zip" id="${p}ZipLabel">ZIP code <span class="fg-loc-opt">(optional)</span></label>
          <input type="text" id="${p}Zip" inputmode="numeric" autocomplete="postal-code" maxlength="10" placeholder="e.g. 43210" />
        </div>
      </div>
      <div class="fg-loc-hint" id="${p}Hint" aria-live="polite"></div>`;

    const $ = s => el.querySelector('#' + p + s);
    const countryEl = $('Country'), stateEl = $('State'), regionEl = $('Region');
    const cityEl = $('City'), listEl = $('CityList'), zipEl = $('Zip'), hintEl = $('Hint');
    countryEl.value = opts.country || 'US';

    let pendingState = null;
    const hint = (t, warn) => { hintEl.textContent = t || ''; hintEl.classList.toggle('warn', !!warn); };

    async function fillStates() {
      const c = countryEl.value;
      const mapped = MAPPED.includes(c);
      stateEl.style.display  = mapped ? '' : 'none';
      regionEl.style.display = mapped ? 'none' : '';
      $('StateLabel').textContent = c === 'CA' ? 'Province *' : c === 'US' ? 'State *' : 'State / region';
      $('ZipLabel').innerHTML = (c === 'US' ? 'ZIP code' : 'Postal code') + ' <span class="fg-loc-opt">(optional)</span>';
      zipEl.placeholder = c === 'US' ? 'e.g. 43210' : c === 'CA' ? 'e.g. K1A 0B1' : '';
      zipEl.inputMode = c === 'US' ? 'numeric' : 'text';
      cityEl.placeholder = c === 'US' ? 'Pick a state first' : '';
      listEl.innerHTML = '';
      if (!mapped) { stateEl.innerHTML = ''; return; }
      stateEl.innerHTML = '<option value="">Loading…</option>';
      try {
        const rs = await regions(c);
        stateEl.innerHTML = `<option value="">Select ${c === 'CA' ? 'a province' : 'a state'}…</option>` +
          rs.map(r => `<option value="${r.code}">${esc(r.name)}</option>`).join('');
      } catch (_) {
        stateEl.innerHTML = '<option value="">Could not load the list - refresh the page</option>';
      }
      if (pendingState) { stateEl.value = pendingState; pendingState = null; }
      await fillCities();
    }

    async function fillCities() {
      listEl.innerHTML = '';
      const c = countryEl.value, st = stateEl.value;
      if (c !== 'US') { cityEl.placeholder = ''; return; }
      if (!st) { cityEl.placeholder = 'Pick a state first'; return; }
      cityEl.placeholder = 'Start typing…';
      const names = await cities(c, st).catch(() => []);
      // A datalist is a type-ahead over the real list, so a 1,000-town
      // state is still one keystroke or two away.
      listEl.innerHTML = names.map(n => `<option value="${esc(n)}"></option>`).join('');
    }

    let lastZip = '';
    async function onZip() {
      const c = countryEl.value;
      const raw = zipEl.value.trim();
      if (raw === lastZip) return;
      lastZip = raw;
      if (!raw) { hint(''); return; }
      if (!normZip(c, raw)) {
        if ((c === 'US' && raw.replace(/\D/g, '').length >= 5) || (c === 'CA' && raw.replace(/\s/g, '').length >= 3)) {
          hint(c === 'US' ? 'ZIP codes are five digits.' : 'That does not look like a Canadian postal code.', true);
        }
        return;
      }
      const z = await lookupZip(c, raw, stateEl.value);
      if (!z) { hint(MAPPED.includes(c) ? 'We do not recognise that code - double-check it, or leave it blank.' : '', MAPPED.includes(c)); return; }
      if (stateEl.value !== z.state) { stateEl.value = z.state; await fillCities(); }
      if (z.city && !cityEl.value.trim()) cityEl.value = z.city;
      const rn = (await region(c, z.state))?.name || z.state;
      hint((z.city ? z.city + ', ' : '') + rn + ' - found.');
    }

    countryEl.addEventListener('change', () => { cityEl.value = ''; zipEl.value = ''; lastZip = ''; hint(''); fillStates(); });
    // Picking a different state by hand means the ZIP and city typed for
    // the old one no longer apply - otherwise the ZIP would pull the
    // state straight back.
    stateEl.addEventListener('change', () => { cityEl.value = ''; zipEl.value = ''; lastZip = ''; hint(''); fillCities(); });
    zipEl.addEventListener('input', () => { clearTimeout(zipEl._t); zipEl._t = setTimeout(onZip, 250); });

    const ready = fillStates();

    async function read() {
      await ready;
      const country = countryEl.value;
      const mapped = MAPPED.includes(country);
      const state = mapped ? stateEl.value : null;
      const regionText = mapped ? null : regionEl.value.trim() || null;
      let city = cityEl.value.trim() || null;
      const zipRaw = zipEl.value.trim();
      const zip = zipRaw ? normZip(country, zipRaw) : null;

      if (mapped && required && !state) {
        return { ok: false, error: country === 'CA' ? 'Please choose your province.' : 'Please choose your state.' };
      }
      if (zipRaw && !zip) {
        return { ok: false, error: country === 'US' ? 'ZIP codes are five digits - fix it or leave it blank.' : 'Please check the postal code, or leave it blank.' };
      }
      let pt = null;
      if (mapped) {
        if (zip) {
          const z = await lookupZip(country, zip, state);
          if (z && state && z.state !== state) {
            const rn = (await region(country, z.state))?.name || z.state;
            return { ok: false, error: `That ZIP code is in ${rn}, not the state selected. Fix one of them.` };
          }
        }
        if (city) {
          // Snap to the list's spelling so "columbus" and "Columbus" are one town.
          const c = await lookupCity(country, state, city);
          if (c) city = c.name;
        }
        pt = await resolve({ country, state, city, zip });
      }
      return {
        ok: true,
        value: {
          country,
          state_code:     state,
          region:         regionText,
          city,
          postal_code:    zip,
          latitude:       pt ? pt.lat : null,
          longitude:      pt ? pt.lng : null,
          geocode_source: pt ? 'fg_' + pt.source : null,
        }
      };
    }

    async function set(v = {}) {
      await ready;
      countryEl.value = v.country || 'US';
      pendingState = v.state_code || null;
      await fillStates();
      if (!MAPPED.includes(countryEl.value)) regionEl.value = v.region || '';
      cityEl.value = (v.city || '').split(',')[0].trim();
      zipEl.value = v.postal_code || '';
      lastZip = zipEl.value.trim();
      hint('');
    }

    function clear() { return set({ country: 'US' }); }

    return { read, set, clear, ready };
  }

  window.FG_GEO = {
    countries, countryName, regions, region, cities,
    lookupZip, lookupCity, resolve, resolveJudge,
    milesBetween, label, mountPicker, MAPPED,
  };
})();
