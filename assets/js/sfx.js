/* ================================================================
   SFX - Sound Effects System
   Web Audio API based, polyphonic (multiple simultaneous sounds).
   Volume stored in localStorage under 'krr_sfx_vol' (0–1, default 0.5).
   Each play() call gets a tiny random pitch shift (±4%) for variety.
================================================================ */

const STORAGE_KEY = 'krr_sfx_vol';

let _ctx = null;
let _masterGain = null;
let _vol = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '0.5');

// Decoded AudioBuffer cache
const _cache = {};

function _getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = _vol;
    _masterGain.connect(_ctx.destination);
  }
  return _ctx;
}

async function _load(path) {
  if (_cache[path]) return _cache[path];
  const ctx = _getCtx();
  const res = await fetch(path);
  const buf = await res.arrayBuffer();
  const decoded = await ctx.decodeAudioData(buf);
  _cache[path] = decoded;
  return decoded;
}

// Preload all sounds eagerly on first user interaction
const SOUNDS = {
  // Roguelite combat & navigation
  roomClear:       'assets/sounds/short_victory_chime.mp3',
  worldClear:      'assets/sounds/level_up_fanfare.mp3',
  arrowShoot:      'assets/sounds/arrow_shoot.mp3',
  playerDamage:    'assets/sounds/damage_player.mp3',
  damageBlocked:   'assets/sounds/damage_blocked.mp3',
  monsterDamage:   'assets/sounds/monster_damage.mp3',
  monsterDeath:    'assets/sounds/monster_death.mp3',
  freezeHit:       'assets/sounds/player_freezing.mp3',
  musicianNote:    'assets/sounds/musician_note_shoot.mp3',
  teleport:        'assets/sounds/teleport_whoosh.mp3',
  roomNavigate:    'assets/sounds/room_navigate_teleport.mp3',
  itemPickup:      'assets/sounds/item_pickup_pluck.mp3',
  itemUse:         'assets/sounds/item_use.mp3',
  // UI
  bookOpen:        'assets/sounds/book_page_flip.mp3',
  bookTabFlip:     'assets/sounds/book_page.mp3',
  mapOpen:         'assets/sounds/paper_rustle_fold_unfold.mp3',
  backpackOpen:    'assets/sounds/ctrl_menu_backpack_zip_open.mp3',
  invNavigate:     'assets/sounds/item_pickup_pluck.mp3',
  uiHover:         'assets/sounds/ui_hover_soft.mp3',
  uiClick:         'assets/sounds/ui_button_click.mp3',
  diceRoll:        'assets/sounds/dice_roll.mp3',
  // Teacher
  lessonDone:      'assets/sounds/soft_success_ding.mp3',
  testAnswer:      'assets/sounds/ui_button_click.mp3',
  testWin:         'assets/sounds/short_victory_chime.mp3',
  testGiveup:      'assets/sounds/minor_error.mp3',
  // Dojang
  doStrokeOk:      'assets/sounds/correct_short_tone.mp3',
  doMinorError:    'assets/sounds/minor_error.mp3',
  doMajorError:    'assets/sounds/major_error_buzz.mp3',
};

// Preload after first interaction so AudioContext can be created
let _preloaded = false;
export function preloadSFX() {
  if (_preloaded) return;
  _preloaded = true;
  _getCtx(); // create context
  for (const path of Object.values(SOUNDS)) {
    _load(path).catch(() => {}); // silent fail if file missing
  }
}

/**
 * Play a named sound.
 * @param {string} name  - key from SOUNDS
 * @param {number} [vol] - optional per-call volume multiplier (0–1)
 */
export function play(name, vol = 1) {
  if (_vol <= 0) return;
  const path = SOUNDS[name];
  if (!path) return;
  const ctx = _getCtx();
  if (ctx.state === 'suspended') ctx.resume();

  _load(path).then(buf => {
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    // Tiny random pitch shift: ±4%
    src.playbackRate.value = 0.96 + Math.random() * 0.08;

    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(_masterGain);
    src.start();
  }).catch(() => {});
}

export function getVolume() { return _vol; }

export function setVolume(v) {
  _vol = Math.max(0, Math.min(1, v));
  if (_masterGain) _masterGain.gain.value = _vol;
  localStorage.setItem(STORAGE_KEY, String(_vol));
}

/* ================================================================
   AMBIENT MUSIC SYSTEM
   Looping background music. Each track is an <audio> element for
   reliable looping (Web Audio API looping has gaps on some browsers).
   Volume stored under 'krr_music_vol' (0–1, default 0.35).
================================================================ */
const MUSIC_STORAGE_KEY = 'krr_music_vol';
let _musicVol = parseFloat(localStorage.getItem(MUSIC_STORAGE_KEY) ?? '0.35');

const MUSIC_TRACKS = {
  // World tracks
  palace:     'assets/music/palace.mp3',
  jeju:       'assets/music/jeju.mp3',
  haeundae:   'assets/music/haeundae.mp3',
  myeongdong: 'assets/music/myeongdong.mp3',
  seoraksan:  'assets/music/seoraksan.mp3',
  baekdu:     'assets/music/baekdu.mp3',
  insadong:   'assets/music/insadong.mp3',
  eastsea:    'assets/music/eastsea.mp3',
  jeonju:     'assets/music/jeonju.mp3',
  gyeongju:   'assets/music/gyeongju.mp3',
  yeouido:    'assets/music/yeouido.mp3',
  dokdo:      'assets/music/dokdo.mp3',
  gangnam:    'assets/music/gangnam.mp3',
  yonggoong:  'assets/music/yonggoong.mp3',
  cosmos:     'assets/music/cosmos.mp3',
  // Special tracks
  forest:     'assets/music/forest.mp3',
  boss:       'assets/music/boss.mp3',
  casino:     'assets/music/casino.mp3',
  gift:       'assets/music/gift.mp3',
  camp:       'assets/music/camp.mp3',
  menu:       'assets/music/menu.mp3',
};

let _musicEl    = null; // current <audio> element
let _musicTrack = null; // currently playing track key
let _musicFade  = null; // { to: AudioElement, fadeIn: 0, fadeOut: 0, dur }
let _fadeTick   = null; // requestAnimationFrame handle

function _createAudio(src) {
  const a = new Audio(src);
  a.loop   = true;
  a.volume = _musicVol;
  return a;
}

function _stopFade() {
  if (_fadeTick) { cancelAnimationFrame(_fadeTick); _fadeTick = null; }
  _musicFade = null;
}

export function getMusicVolume() { return _musicVol; }

export function setMusicVolume(v) {
  _musicVol = Math.max(0, Math.min(1, v));
  localStorage.setItem(MUSIC_STORAGE_KEY, String(_musicVol));
  if (_musicEl) _musicEl.volume = _musicVol;
  if (_musicFade?.to) _musicFade.to.volume = 0; // will ramp to _musicVol
}

export function playMusic(trackKey, crossfadeDur = 1.2) {
  if (_musicVol <= 0) return;
  const src = MUSIC_TRACKS[trackKey];
  if (!src) return;
  if (_musicTrack === trackKey && _musicEl && !_musicEl.paused) return; // already playing

  const next = _createAudio(src);
  next.volume = 0;
  next.play().catch(() => {}); // silent fail if file missing or before user gesture

  _stopFade();

  const prev = _musicEl;
  const prevStartVol = prev ? prev.volume : 0;
  const startTime = performance.now();

  _musicFade = { to: next, dur: crossfadeDur * 1000 };
  _musicEl    = next;
  _musicTrack = trackKey;

  function tick() {
    const p = Math.min(1, (performance.now() - startTime) / _musicFade?.dur);
    if (next) next.volume = p * _musicVol;
    if (prev) prev.volume = prevStartVol * (1 - p);
    if (p < 1) {
      _fadeTick = requestAnimationFrame(tick);
    } else {
      if (prev) { prev.pause(); prev.src = ''; }
      if (next) next.volume = _musicVol;
      _stopFade();
    }
  }
  _fadeTick = requestAnimationFrame(tick);
}

export function stopMusic(fadeDur = 0.8) {
  if (!_musicEl) return;
  const el = _musicEl;
  const startVol = el.volume;
  const startTime = performance.now();
  _stopFade();
  _musicEl    = null;
  _musicTrack = null;

  function tick() {
    const p = Math.min(1, (performance.now() - startTime) / (fadeDur * 1000));
    el.volume = startVol * (1 - p);
    if (p < 1) requestAnimationFrame(tick);
    else { el.pause(); el.src = ''; }
  }
  requestAnimationFrame(tick);
}
