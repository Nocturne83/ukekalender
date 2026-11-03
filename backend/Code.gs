/**
 * Ukeplanen v2 – backend (Google Apps Script)
 *
 * The app itself lives on GitHub Pages. This script stores data in a Google Sheet,
 * syncs to the "Husholdning" calendar / Google Tasks, and sends push notifications.
 *
 * PRIVACY: no names, email addresses or other personal data belong in this file.
 * They are stored as Script Properties (Project Settings > Script Properties):
 *   NAME_P1      Display name of person 1 (the owner of this script)
 *   NAME_P2      Display name of person 2
 *   EMAIL_P2     Email address of person 2 (person 1's comes from the Google account)
 *   APP_URL      Address of the app, e.g. https://<user>.github.io/<repo>/
 *   FIREBASE_CONFIG, FIREBASE_VAPID, FCM_SERVICE_ACCOUNT   (for push, optional)
 *
 * Sync rules:
 *  - New appointments sync only when BOTH have said yes.
 *  - All-day appointments -> all-day event in the Husholdning calendar.
 *  - Person 1 responsible -> Google Task in person 1's default list (time in the title).
 *  - Anyone else          -> event in the Husholdning calendar.
 *  - Changes after confirmation need a comment; the other person is notified.
 */

// ===================== Settings (no personal data here) =====================
const CONFIG = {
  APP_NAME: 'Ukeplanen',
  TIME_ZONE: 'Europe/Oslo',
  CALENDAR_NAME: 'Husholdning',
  EVENT_POPUP_MINUTES: 30,   // pop-up reminder on timed events. 0 = none.
  REMINDER_HOUR: 20,         // hour reminders are sent (20 = 20:00)
  WEEKS_BACK: 2,
  WEEKS_AHEAD: 13,
  // Fixed setup per weekday, Monday first. Values: 'p1', 'p2', 'both', 'grand', 'takeaway', ''.
  // null = not shown that day.
  DEFAULT_TILES: {
    middag: ['p2', 'p2', 'p2', 'p2', 'p2', 'p2', 'p2'],
    bil:    ['p1', 'p1', 'p1', 'p1', 'p1', 'p1', 'p1'],
    lev:    ['p1', 'p1', 'p1', 'p1', 'p1', null, null],
    hent:   ['p2', 'p2', 'p2', 'p2', 'p2', null, null]
  },
  TILE_OPTIONS: {
    middag: ['p2', 'p1', 'both', 'grand', 'takeaway', ''],
    bil:    ['p1', 'p2', 'both', ''],
    lev:    ['p1', 'p2', 'both', 'grand', ''],
    hent:   ['p2', 'p1', 'both', 'grand', '']
  }
};
// ===========================================================================

const PERSONS = ['p1', 'p2'];
// Column order matters: v1 data uses the same positions.
const ITEM_COLS = ['id', 'date', 'start', 'end', 'title', 'desc', 'who', 'by', 'ok2', 'ok1',
  'status', 'eventId', 'taskId', 'note', 'noteBy', 'src', 'created', 'updated',
  'allDay', 'where', 'whereAddr', 'lat', 'lng', 'mapUrl'];
const TILE_COLS = ['date', 'key', 'value', 'by', 'updated'];
const NOTE_COLS = ['id', 'to', 'text', 'itemId', 'created', 'seen'];
const DEVICE_COLS = ['token', 'person', 'created'];
const TILE_NAMES = { middag: 'Middag', bil: 'Bilen', lev: 'Levering bhg.', hent: 'Henting bhg.' };
const DAY_NAMES = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

// ===================== Setup & maintenance (run from the editor) =====================

/** First-time setup (new installs). Safe to run again. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SHEET_ID');
  if (!ssId) {
    ssId = SpreadsheetApp.create(CONFIG.APP_NAME + ' – data').getId();
    props.setProperty('SHEET_ID', ssId);
  }
  const ss = SpreadsheetApp.openById(ssId);
  ensureSheet_(ss, 'Avtaler', ITEM_COLS);
  ensureSheet_(ss, 'Oppsett', TILE_COLS);
  ensureSheet_(ss, 'Varsler', NOTE_COLS);
  ensureSheet_(ss, 'Enheter', DEVICE_COLS);
  ss.getSheets().forEach(function (sh) {
    if (['Avtaler', 'Oppsett', 'Varsler', 'Enheter'].indexOf(sh.getName()) === -1 && sh.getLastRow() === 0 && ss.getSheets().length > 4) ss.deleteSheet(sh);
  });

  let calId = props.getProperty('CAL_ID');
  if (!calId) {
    const existing = CalendarApp.getCalendarsByName(CONFIG.CALENDAR_NAME);
    calId = (existing.length ? existing[0] : CalendarApp.createCalendar(CONFIG.CALENDAR_NAME)).getId();
    props.setProperty('CAL_ID', calId);
  }
  CalendarApp.getCalendarById(calId).setTimeZone(CONFIG.TIME_ZONE);

  PERSONS.forEach(function (p) {
    if (!props.getProperty('KEY_' + p)) props.setProperty('KEY_' + p, newKey_());
  });

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'hourlyReminder') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hourlyReminder').timeBased().everyHours(1).create();

  checkSettings();
}

/** Checks that everything is filled in, and logs what is missing. */
function checkSettings() {
  const props = PropertiesService.getScriptProperties();
  ['NAME_P1', 'NAME_P2', 'EMAIL_P2', 'APP_URL'].forEach(function (k) {
    Logger.log((props.getProperty(k) ? '✅ ' : '⚠️ missing: ') + k);
  });
  const push = ['FIREBASE_CONFIG', 'FIREBASE_VAPID', 'FCM_SERVICE_ACCOUNT'].filter(function (k) { return !props.getProperty(k); });
  Logger.log(push.length ? 'ℹ️ Push not set up yet (missing ' + push.join(', ') + '). Email is used instead.' : '✅ Push settings found');
  try { Tasks.Tasklists.list({ maxResults: 1 }); Logger.log('✅ Google Tasks'); } catch (err) { Logger.log('⚠️ Google Tasks API is not on'); }
  if (push.length === 0) {
    try { fcmAccessToken_(); Logger.log('✅ Push: service account works'); } catch (err) { Logger.log('⚠️ Push: ' + err.message); }
  }
}

/** Run after deploying: logs the two personal links. */
function showLinks() {
  const url = ScriptApp.getService().getUrl();
  if (!url) { Logger.log('Deploy as a web app first.'); return; }
  if (!prop_('APP_URL')) { Logger.log('Fill in APP_URL under Script Properties first.'); return; }
  PERSONS.forEach(function (p) { Logger.log(name_(p) + ': ' + appLink_(p)); });
  Logger.log('Keep the links private – whoever has a link can use the app.');
}

/** Makes new links (the old ones stop working). */
function newLinks() {
  PERSONS.forEach(function (p) { PropertiesService.getScriptProperties().setProperty('KEY_' + p, newKey_()); });
  showLinks();
}

/** Sends a test push to every device that has turned on notifications. */
function testPush() {
  PERSONS.forEach(function (p) { push_(p, CONFIG.APP_NAME, 'Testvarsel til ' + name_(p) + ' ✅'); });
  Logger.log('Sent. Devices: ' + readRows_(sheet_('Enheter'), DEVICE_COLS).length);
}

/** Fixes the calendar's time zone and moves existing events to the right time. */
function fixTimes() {
  cal_().setTimeZone(CONFIG.TIME_ZONE);
  let n = 0;
  readRows_(sheet_('Avtaler'), ITEM_COLS).forEach(function (it) {
    if (it.status === 'avlyst' || !it.eventId || !(it.ok1 && it.ok2)) return;
    it.eventId = upsertEvent_(it);
    saveRow_(it);
    n++;
  });
  Logger.log('✅ Events fixed: ' + n);
}

// ===================== Web API =====================

function doGet() {
  return ContentService.createTextOutput(CONFIG.APP_NAME + ' backend is running. Open the app through your personal link.');
}

const API = {
  getState: function (me) { try { importFromCalendar_(); } catch (err) { console.warn('Import: ' + err); } return state_(me); },
  saveItem: saveItem_, confirmItem: confirmItem_, undoConfirm: undoConfirm_, changeItem: changeItem_,
  cancelItem: cancelItem_, setTile: setTile_, markSeen: markSeen_, setReminder: setReminder_,
  registerPush: registerPush_, unregisterPush: unregisterPush_
};

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const me = who_(req.k);
    const fn = API[req.fn];
    if (!fn) throw new Error('Ukjent handling');
    const args = [me].concat(req.args || []);
    const data = req.fn === 'getState' ? fn.apply(null, args) : withLock_(function () { return fn.apply(null, args); });
    out = { ok: true, data: data };
  } catch (err) {
    out = { ok: false, error: err.message || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ===================== Actions =====================

function saveItem_(me, f) {
  const it = clean_(f);
  it.id = 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
  it.by = me;
  it[okF_(me)] = '1';
  it[okF_(other_(me))] = '';
  it.status = 'aktiv';
  it.src = 'app';
  it.created = it.updated = nowIso_();
  Object.assign(it, place_(it.where));
  appendRow_('Avtaler', ITEM_COLS, it);
  notify_(other_(me), name_(me) + ' har lagt inn «' + it.title + '» ' + when_(it) + '. Stemmer det?', it.id, true);
  return state_(me);
}

function confirmItem_(me, id) {
  const it = getItem_(id);
  it[okF_(me)] = '1';
  if (it.ok1 && it.ok2) {
    sync_(it);
    notify_(other_(me), name_(me) + ' bekreftet «' + it.title + '» ' + when_(it) + '.', it.id, false);
  }
  it.updated = nowIso_();
  saveRow_(it);
  return state_(me);
}

/** Takes back a "yes" (e.g. tapped by mistake). The appointment goes back to undecided. */
function undoConfirm_(me, id) {
  const it = getItem_(id);
  if (it.by === me) throw new Error('Du kan ikke angre din egen avtale – endre eller avlys den i stedet.');
  const wasConfirmed = !!(it.ok1 && it.ok2);
  it[okF_(me)] = '';
  if (wasConfirmed) {
    unsync_(it);
    notify_(other_(me), name_(me) + ' angret bekreftelsen av «' + it.title + '» – den er ikke avklart ennå.', it.id, false);
  }
  it.updated = nowIso_();
  saveRow_(it);
  return state_(me);
}

function changeItem_(me, id, f, comment) {
  const it = getItem_(id);
  const wasConfirmed = !!(it.ok1 && it.ok2);
  comment = String(comment || '').trim();
  if ((wasConfirmed || it.by !== me) && !comment) throw new Error('Skriv kort hvorfor det endres.');
  const before = summary_(it);
  const oldWhere = it.where;
  const c = clean_(f);
  ['date', 'start', 'end', 'title', 'desc', 'who', 'allDay', 'where'].forEach(function (k) { it[k] = c[k]; });
  if (it.where !== oldWhere) Object.assign(it, place_(it.where));
  if (comment) { it.note = comment; it.noteBy = me; }
  it.updated = nowIso_();
  const other = other_(me);
  if (wasConfirmed) {
    sync_(it);
    notify_(other, name_(me) + ' endret «' + it.title + '»: ' + diff_(before, summary_(it)) + (comment ? ' – «' + comment + '»' : ''), it.id, true);
  } else {
    it[okF_(me)] = '1';
    it[okF_(other)] = '';
    notify_(other, name_(me) + ' foreslår en endring på «' + it.title + '» ' + when_(it) + (comment ? ' – «' + comment + '»' : '') + '. Stemmer det?', it.id, true);
  }
  saveRow_(it);
  return state_(me);
}

function cancelItem_(me, id, comment) {
  const it = getItem_(id);
  comment = String(comment || '').trim();
  if (!comment) throw new Error('Skriv kort hvorfor det avlyses.');
  unsync_(it);
  it.status = 'avlyst';
  it.note = comment;
  it.noteBy = me;
  it.updated = nowIso_();
  saveRow_(it);
  notify_(other_(me), name_(me) + ' avlyste «' + it.title + '» ' + when_(it) + ' – «' + comment + '»', '', true);
  return state_(me);
}

function setTile_(me, date, k, value) {
  if (!CONFIG.TILE_OPTIONS[k] || CONFIG.TILE_OPTIONS[k].indexOf(value) === -1) throw new Error('Ugyldig valg');
  const sh = sheet_('Oppsett');
  const row = readRows_(sh, TILE_COLS).filter(function (r) { return r.date === date && r.key === k; })[0];
  const rec = { date: date, key: k, value: value, by: me, updated: nowIso_() };
  if (row) writeRow_(sh, TILE_COLS, row._row, rec); else appendRow_('Oppsett', TILE_COLS, rec);
  notify_(other_(me), name_(me) + ' endret ' + TILE_NAMES[k].toLowerCase() + ' ' + dateLabel_(date) + ': ' + tileLabel_(value) + '.', '', false);
  return state_(me);
}

function markSeen_(me, ids) {
  const sh = sheet_('Varsler');
  readRows_(sh, NOTE_COLS).forEach(function (n) {
    if (n.to === me && !n.seen && (ids === 'all' || ids.indexOf(n.id) !== -1)) {
      n.seen = '1';
      writeRow_(sh, NOTE_COLS, n._row, n);
    }
  });
  return state_(me);
}

function setReminder_(me, mode) {
  if (['sunday', 'daily', 'off'].indexOf(mode) === -1) throw new Error('Ugyldig valg');
  PropertiesService.getScriptProperties().setProperty('REM_' + me, mode);
  return state_(me);
}

function registerPush_(me, token) {
  token = String(token || '');
  if (token.length < 20) throw new Error('Ugyldig enhet');
  const sh = sheet_('Enheter');
  const exists = readRows_(sh, DEVICE_COLS).some(function (d) { return d.token === token && d.person === me; });
  if (!exists) appendRow_('Enheter', DEVICE_COLS, { token: token, person: me, created: nowIso_() });
  push_(me, CONFIG.APP_NAME, 'Varsler er slått på ✅');
  return state_(me);
}

function unregisterPush_(me, token) {
  removeDevice_(token);
  return state_(me);
}

// ===================== Reminders (every hour) =====================

function hourlyReminder() {
  const now = new Date();
  if (Number(Utilities.formatDate(now, CONFIG.TIME_ZONE, 'H')) !== CONFIG.REMINDER_HOUR) return;
  const isSunday = Utilities.formatDate(now, CONFIG.TIME_ZONE, 'u') === '7';
  const items = activeItems_();
  PERSONS.forEach(function (p) {
    const mode = prop_('REM_' + p) || 'sunday';
    if (mode === 'off' || (mode === 'sunday' && !isSunday)) return;
    const waiting = items.filter(function (it) { return !it[okF_(p)]; }).length;
    const text = (isSunday ? 'Husk å legge inn planene for neste uke.' : 'Har du noe nytt å legge inn?') +
      (waiting ? ' ' + waiting + ' ting venter på svar fra deg.' : '');
    if (!push_(p, CONFIG.APP_NAME, text)) sendMail_(p, CONFIG.APP_NAME + ': påminnelse', text);
  });
}

// ===================== Calendar / Tasks sync =====================

function sync_(it) {
  const asTask = it.who === 'p1' && !it.allDay && it.src !== 'kalender';
  if (asTask) {
    if (it.eventId) { deleteEvent_(it.eventId); it.eventId = ''; }
    it.taskId = upsertTask_(it);
  } else {
    if (it.taskId) { deleteTask_(it.taskId); it.taskId = ''; }
    it.eventId = upsertEvent_(it);
  }
}

function unsync_(it) {
  if (it.eventId) { deleteEvent_(it.eventId); it.eventId = ''; }
  if (it.taskId) { deleteTask_(it.taskId); it.taskId = ''; }
}

function cal_() {
  const cal = CalendarApp.getCalendarById(prop_('CAL_ID'));
  if (!cal) throw new Error('Fant ikke Husholdning-kalenderen. Kjør setup på nytt.');
  return cal;
}

function eventTitle_(it) { return whoLabel_(it.who) + ': ' + it.title; }

function eventDesc_(it) {
  return [it.desc, it.whereAddr || it.where ? 'Hvor: ' + (it.whereAddr || it.where) : '', it.note ? 'Sist endret: ' + it.note : '', 'Fra ' + CONFIG.APP_NAME]
    .filter(String).join('\n');
}

function upsertEvent_(it) {
  const cal = cal_();
  let ev = it.eventId ? cal.getEventById(it.eventId) : null;
  const opts = { description: eventDesc_(it), location: it.whereAddr || it.where || '' };
  if (it.allDay) {
    const day = toDate_(it.date, '00:00');
    if (ev) { ev.setAllDayDate(day); } else { ev = cal.createAllDayEvent(eventTitle_(it), day, opts); }
  } else {
    const start = toDate_(it.date, it.start || '12:00');
    const end = it.end ? toDate_(it.date, it.end) : new Date(start.getTime() + 3600000);
    if (ev) { ev.setTime(start, end); } else { ev = cal.createEvent(eventTitle_(it), start, end, opts); }
  }
  ev.setTitle(eventTitle_(it));
  ev.setDescription(opts.description);
  ev.setLocation(opts.location);
  ev.removeAllReminders();
  if (!it.allDay && CONFIG.EVENT_POPUP_MINUTES > 0) ev.addPopupReminder(CONFIG.EVENT_POPUP_MINUTES);
  return ev.getId();
}

function deleteEvent_(id) {
  try { const ev = cal_().getEventById(id); if (ev) ev.deleteEvent(); } catch (err) { console.warn(err); }
}

function upsertTask_(it) {
  const res = {
    title: (it.start ? it.start + (it.end ? '–' + it.end : '') + ' ' : '') + it.title,
    notes: [it.desc, it.whereAddr || it.where ? 'Hvor: ' + (it.whereAddr || it.where) : '', it.note ? 'Sist endret: ' + it.note : ''].filter(String).join('\n'),
    due: it.date + 'T00:00:00.000Z'
  };
  try {
    if (it.taskId) {
      try { Tasks.Tasks.patch(res, '@default', it.taskId); return it.taskId; } catch (e) { /* deleted – make a new one */ }
    }
    return Tasks.Tasks.insert(res, '@default').id;
  } catch (err) {
    throw new Error('Kunne ikke lage oppgave i Google Tasks (' + err.message + ')');
  }
}

function deleteTask_(id) {
  try { Tasks.Tasks.remove('@default', id); } catch (err) { console.warn(err); }
}

/** Picks up new events put straight into the Husholdning calendar. */
function importFromCalendar_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('imported')) return;
  cache.put('imported', '1', 120);
  const range = window_();
  const events = cal_().getEvents(toDate_(range.from, '00:00'), toDate_(range.to, '23:59'));
  const known = {};
  readRows_(sheet_('Avtaler'), ITEM_COLS).forEach(function (r) { if (r.eventId) known[r.eventId] = true; });
  const labels = {};
  labels[name_('p1').toLowerCase()] = 'p1'; labels[name_('p2').toLowerCase()] = 'p2'; labels['begge'] = 'both';
  let added = 0;
  events.forEach(function (ev) {
    if (known[ev.getId()] || ev.isRecurringEvent()) return;
    let title = ev.getTitle(), who = 'both';
    const m = title.match(/^([^:]{1,20}):\s*(.+)$/);
    if (m) { who = labels[m[1].trim().toLowerCase()] || m[1].trim(); title = m[2].trim(); }
    const allDay = ev.isAllDayEvent();
    const desc = (ev.getDescription() || '').replace(/\n?Fra Ukeplanen\s*$/, '');
    const it = {
      id: 'k' + Date.now().toString(36) + added,
      date: Utilities.formatDate(allDay ? ev.getAllDayStartDate() : ev.getStartTime(), CONFIG.TIME_ZONE, 'yyyy-MM-dd'),
      start: allDay ? '' : Utilities.formatDate(ev.getStartTime(), CONFIG.TIME_ZONE, 'HH:mm'),
      end: allDay ? '' : Utilities.formatDate(ev.getEndTime(), CONFIG.TIME_ZONE, 'HH:mm'),
      title: title, desc: desc, who: who, by: 'p1', ok1: '1', ok2: '', status: 'aktiv',
      eventId: ev.getId(), taskId: '', note: '', noteBy: '', src: 'kalender',
      created: nowIso_(), updated: nowIso_(), allDay: allDay ? '1' : '', where: ev.getLocation() || ''
    };
    if (it.where) Object.assign(it, place_(it.where));
    appendRow_('Avtaler', ITEM_COLS, it);
    notify_('p2', name_('p1') + ' har lagt inn «' + it.title + '» ' + when_(it) + '. Stemmer det?', it.id, false);
    known[it.eventId] = true;
    added++;
  });
}

// ===================== Places (Hvor?) =====================

/** Turns an address or a Google Maps link into an address, coordinates and a small map. */
function place_(where) {
  const out = { whereAddr: '', lat: '', lng: '', mapUrl: '' };
  where = String(where || '').trim();
  if (!where) return out;
  try {
    let lat = null, lng = null, query = where;
    if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.)/i.test(where)) {
      const url = followRedirects_(where);
      const precise = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const q = url.match(/[?&](?:q|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
      const c = precise || q || at;
      if (c) { lat = Number(c[1]); lng = Number(c[2]); }
      const placeName = url.match(/\/place\/([^/@?]+)/);
      const qText = url.match(/[?&]q=([^&]+)/);
      query = placeName ? decodeURIComponent(placeName[1].replace(/\+/g, ' ')) : (qText ? decodeURIComponent(qText[1].replace(/\+/g, ' ')) : '');
    }
    const geo = Maps.newGeocoder().setLanguage('no').setRegion('no');
    let res = null;
    if (lat !== null) {
      res = geo.reverseGeocode(lat, lng);
      out.whereAddr = query && !/^-?\d/.test(query) ? query + ', ' + ((res.results[0] || {}).formatted_address || '') : ((res.results[0] || {}).formatted_address || '');
    } else if (query) {
      res = geo.geocode(query);
      const r = res.results && res.results[0];
      if (r) {
        lat = r.geometry.location.lat; lng = r.geometry.location.lng;
        out.whereAddr = r.formatted_address;
      }
    }
    if (lat !== null) {
      out.lat = String(lat); out.lng = String(lng);
      out.mapUrl = Maps.newStaticMap().setSize(240, 140).setZoom(15).setLanguage('no').addMarker(lat, lng).getMapUrl();
    }
  } catch (err) { console.warn('Place lookup failed: ' + err); }
  out.whereAddr = out.whereAddr.replace(/, Norge$/, '').replace(/^,\s*/, '');
  return out;
}

function followRedirects_(url) {
  for (let i = 0; i < 5; i++) {
    const r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    const loc = r.getHeaders()['Location'] || r.getHeaders()['location'];
    if (!loc) return url;
    url = loc;
  }
  return url;
}

// ===================== Notifications =====================

function notify_(to, text, itemId, important) {
  appendRow_('Varsler', NOTE_COLS, { id: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1000), to: to, text: text, itemId: itemId || '', created: nowIso_(), seen: '' });
  const pushed = push_(to, CONFIG.APP_NAME, text);
  if (important && !pushed) sendMail_(to, CONFIG.APP_NAME + ': ' + text.slice(0, 70), text);
}

/** Sends a push to all of a person's devices. Returns true if at least one got it. */
function push_(p, title, body) {
  const sa = prop_('FCM_SERVICE_ACCOUNT');
  if (!sa) return false;
  const devices = readRows_(sheet_('Enheter'), DEVICE_COLS).filter(function (d) { return d.person === p; });
  if (!devices.length) return false;
  let ok = false;
  try {
    const account = JSON.parse(sa);
    const token = fcmAccessToken_();
    const link = prop_('APP_URL') || '';
    devices.forEach(function (d) {
      const r = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + account.project_id + '/messages:send', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ message: {
          token: d.token,
          notification: { title: title, body: body },
          webpush: { fcm_options: link ? { link: link } : undefined, notification: { icon: link + 'icons/icon-192.png', badge: link + 'icons/badge-96.png' } }
        } })
      });
      const code = r.getResponseCode();
      if (code === 200) ok = true;
      else if (code === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(r.getContentText())) removeDevice_(d.token);
      else console.warn('Push failed: ' + code + ' ' + r.getContentText());
    });
  } catch (err) { console.warn('Push error: ' + err); }
  return ok;
}

function fcmAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('fcmToken');
  if (cached) return cached;
  const sa = JSON.parse(prop_('FCM_SERVICE_ACCOUNT'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = function (s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); };
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: sa.token_uri, iat: now, exp: now + 3600 }));
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(header + '.' + claim, sa.private_key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch(sa.token_uri, {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + claim + '.' + sig }
  });
  const res = JSON.parse(r.getContentText());
  if (!res.access_token) throw new Error('Could not get push token: ' + r.getContentText());
  cache.put('fcmToken', res.access_token, 3000);
  return res.access_token;
}

function removeDevice_(token) {
  const sh = sheet_('Enheter');
  const rows = readRows_(sh, DEVICE_COLS).filter(function (d) { return d.token === token; });
  rows.reverse().forEach(function (d) { sh.deleteRow(d._row); });
}

function sendMail_(p, subject, text) {
  const to = p === 'p1' ? Session.getEffectiveUser().getEmail() : prop_('EMAIL_P2');
  if (!to) return;
  try {
    MailApp.sendEmail(to, subject, text + (prop_('APP_URL') ? '\n\nÅpne ' + CONFIG.APP_NAME + ': ' + appLink_(p) : ''));
  } catch (err) { console.warn('Mail failed: ' + err); }
}

// ===================== State to the app =====================

function state_(me) {
  const range = window_();
  const items = activeItems_().filter(function (it) { return it.date >= range.from && it.date <= range.to; });
  const tiles = {};
  readRows_(sheet_('Oppsett'), TILE_COLS).forEach(function (t) { tiles[t.date + '|' + t.key] = t.value; });
  const notes = readRows_(sheet_('Varsler'), NOTE_COLS)
    .filter(function (n) { return n.to === me && !n.seen; })
    .map(function (n) { return { id: n.id, text: n.text, itemId: n.itemId, created: n.created }; })
    .reverse();
  let firebase = null;
  try {
    if (prop_('FIREBASE_CONFIG') && prop_('FIREBASE_VAPID')) firebase = { config: parseConfig_(prop_('FIREBASE_CONFIG')), vapidKey: prop_('FIREBASE_VAPID').trim() };
  } catch (err) { console.warn('FIREBASE_CONFIG is not valid JSON'); }
  return {
    me: me,
    names: { p1: name_('p1'), p2: name_('p2') },
    today: Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyy-MM-dd'),
    weeksBack: CONFIG.WEEKS_BACK,
    weeksAhead: CONFIG.WEEKS_AHEAD,
    items: items.map(function (it) {
      return { id: it.id, date: it.date, start: it.start, end: it.end, title: it.title, desc: it.desc, who: it.who,
        by: it.by, ok1: !!it.ok1, ok2: !!it.ok2, note: it.note, noteBy: it.noteBy, src: it.src,
        allDay: !!it.allDay, where: it.where, whereAddr: it.whereAddr, lat: it.lat, lng: it.lng, mapUrl: it.mapUrl };
    }),
    tiles: tiles,
    defaults: CONFIG.DEFAULT_TILES,
    tileOptions: CONFIG.TILE_OPTIONS,
    notes: notes,
    reminder: prop_('REM_' + me) || 'sunday',
    firebase: firebase,
    pushDevices: readRows_(sheet_('Enheter'), DEVICE_COLS).filter(function (d) { return d.person === me; }).length
  };
}

function activeItems_() {
  return readRows_(sheet_('Avtaler'), ITEM_COLS).filter(function (it) { return it.status !== 'avlyst'; });
}

function window_() {
  const today = new Date();
  const dow = Number(Utilities.formatDate(today, CONFIG.TIME_ZONE, 'u'));
  const monday = new Date(today.getTime() - (dow - 1) * 86400000);
  const from = new Date(monday.getTime() - CONFIG.WEEKS_BACK * 7 * 86400000);
  const to = new Date(monday.getTime() + (CONFIG.WEEKS_AHEAD * 7 + 6) * 86400000);
  return { from: Utilities.formatDate(from, CONFIG.TIME_ZONE, 'yyyy-MM-dd'), to: Utilities.formatDate(to, CONFIG.TIME_ZONE, 'yyyy-MM-dd') };
}

// ===================== Helpers =====================

/** Accepts the firebaseConfig exactly as Firebase shows it (JavaScript), or as JSON. */
function parseConfig_(s) {
  s = String(s).trim().replace(/^[^{]*/, '').replace(/[^}]*$/, '');
  try { return JSON.parse(s); } catch (e) {
    return JSON.parse(s.replace(/'/g, '"').replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/,\s*}/, '}'));
  }
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function name_(p) { return prop_(p === 'p1' ? 'NAME_P1' : 'NAME_P2') || (p === 'p1' ? 'Person 1' : 'Person 2'); }
function whoLabel_(w) {
  if (w === 'p1' || w === 'p2') return name_(w);
  if (w === 'both') return 'Begge';
  if (w === 'grand') return 'Besteforeldre';
  return w;
}
function tileLabel_(v) {
  if (!v) return 'ikke satt';
  if (v === 'takeaway') return 'restaurant/takeaway';
  return whoLabel_(v);
}
function newKey_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function appLink_(p) {
  return prop_('APP_URL') + '#k=' + prop_('KEY_' + p) + '&b=' + encodeURIComponent(ScriptApp.getService().getUrl());
}
function who_(key) {
  for (let i = 0; i < PERSONS.length; i++) {
    if (key && key === prop_('KEY_' + PERSONS[i])) return PERSONS[i];
  }
  throw new Error('Denne lenken virker ikke. Be om en ny lenke.');
}
function other_(p) { return p === 'p1' ? 'p2' : 'p1'; }
function okF_(p) { return p === 'p1' ? 'ok1' : 'ok2'; }

function clean_(f) {
  f = f || {};
  const s = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); };
  const it = {
    date: s(f.date, 10), start: s(f.start, 5), end: s(f.end, 5),
    title: s(f.title, 120), desc: s(f.desc, 1000), who: s(f.who, 40) || 'p1',
    allDay: f.allDay ? '1' : '', where: s(f.where, 500)
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date)) throw new Error('Ugyldig dato');
  if (it.allDay) { it.start = ''; it.end = ''; }
  if (it.start && !/^\d{2}:\d{2}$/.test(it.start)) throw new Error('Ugyldig starttid');
  if (it.end && !/^\d{2}:\d{2}$/.test(it.end)) throw new Error('Ugyldig sluttid');
  if (it.start && it.end && it.end <= it.start) throw new Error('Sluttid må være etter starttid');
  if (!it.title) throw new Error('Skriv hva det gjelder');
  return it;
}

function summary_(it) { return { when: when_(it), who: it.who, title: it.title }; }
function diff_(a, b) {
  const parts = [];
  if (a.when !== b.when) parts.push(a.when + ' → ' + b.when);
  if (a.who !== b.who) parts.push('hvem: ' + whoLabel_(a.who) + ' → ' + whoLabel_(b.who));
  if (a.title !== b.title) parts.push('tittel endret');
  return parts.length ? parts.join(', ') : 'detaljer';
}
function when_(it) { return dateLabel_(it.date) + (it.allDay ? ' (hele dagen)' : it.start ? ' kl. ' + it.start : ''); }
function dateLabel_(ds) {
  const p = ds.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], 12);
  return DAY_NAMES[(d.getDay() + 6) % 7] + ' ' + p[2] + '. ' + MONTHS[p[1] - 1];
}
function toDate_(ds, hm) { return Utilities.parseDate(ds + ' ' + hm, CONFIG.TIME_ZONE, 'yyyy-MM-dd HH:mm'); }
function nowIso_() { return Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, "yyyy-MM-dd'T'HH:mm"); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_(name) { return SpreadsheetApp.openById(prop_('SHEET_ID')).getSheetByName(name); }

function ensureSheet_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function readRows_(sh, cols) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = Math.min(cols.length, sh.getMaxColumns());
  return sh.getRange(2, 1, last - 1, width).getValues().map(function (row, i) {
    const o = { _row: i + 2 };
    cols.forEach(function (c, j) {
      let v = j < width ? row[j] : '';
      if (v instanceof Date) v = Utilities.formatDate(v, CONFIG.TIME_ZONE, c === 'start' || c === 'end' ? 'HH:mm' : 'yyyy-MM-dd');
      o[c] = v === true ? '1' : (v === false ? '' : String(v));
    });
    return o;
  });
}

function writeRow_(sh, cols, rowNum, obj) {
  sh.getRange(rowNum, 1, 1, cols.length).setNumberFormat('@')
    .setValues([cols.map(function (c) { return obj[c] == null ? '' : String(obj[c]); })]);
}

function appendRow_(name, cols, obj) {
  const sh = sheet_(name);
  const next = sh.getLastRow() + 1;
  if (next > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  writeRow_(sh, cols, next, obj);
}

function getItem_(id) {
  const it = readRows_(sheet_('Avtaler'), ITEM_COLS).filter(function (r) { return r.id === id; })[0];
  if (!it || it.status === 'avlyst') throw new Error('Fant ikke avtalen');
  return it;
}

function saveRow_(it) { writeRow_(sheet_('Avtaler'), ITEM_COLS, it._row, it); }
