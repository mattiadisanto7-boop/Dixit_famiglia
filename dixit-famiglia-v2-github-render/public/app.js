const socket = io();

const screen = document.getElementById('screen');
const roomBadge = document.getElementById('roomBadge');
const toast = document.getElementById('toast');
const brand = document.getElementById('brand');
const musicBtn = document.getElementById('musicBtn');
const sfxBtn = document.getElementById('sfxBtn');

let state = null;
let previousState = null;
let selectedCardId = null;
let chosenMode = 'duel';
let toastTimer = null;

let audioCtx = null;
let musicTimer = null;
let musicStep = 0;
const audioPrefs = (() => {
  try {
    return { music: true, sfx: true, ...JSON.parse(localStorage.getItem('immaginarioAudio') || '{}') };
  } catch {
    return { music: true, sfx: true };
  }
})();

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

function session() {
  try { return JSON.parse(localStorage.getItem('immaginarioSession') || 'null'); }
  catch { return null; }
}

function saveSession(roomCode, playerToken) {
  localStorage.setItem('immaginarioSession', JSON.stringify({ roomCode, playerToken }));
}

function clearSession() {
  localStorage.removeItem('immaginarioSession');
}

function saveAudioPrefs() {
  localStorage.setItem('immaginarioAudio', JSON.stringify(audioPrefs));
}

function emitAck(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response || { ok: false, error: 'Nessuna risposta dal server.' }));
  });
}

function modeName(mode) {
  return mode === 'cooperative' ? 'Cooperativa' : 'Duello';
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  if (audioPrefs.music) startMusic();
  return audioCtx;
}

function tone(freq, duration = .12, volume = .035, type = 'sine', delay = 0) {
  const ctx = ensureAudio();
  if (!ctx || !audioPrefs.sfx) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + .015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + .03);
}

function sfx(name) {
  if (!audioPrefs.sfx) return;
  if (name === 'select') tone(520, .055, .018, 'triangle');
  if (name === 'action') { tone(440, .08, .026, 'sine'); tone(660, .12, .022, 'sine', .06); }
  if (name === 'clue') { tone(392, .12, .024, 'triangle'); tone(587, .18, .02, 'triangle', .08); }
  if (name === 'deal') { tone(330, .08, .018, 'triangle'); tone(440, .08, .018, 'triangle', .05); tone(554, .11, .018, 'triangle', .1); }
  if (name === 'wrong') { tone(190, .16, .03, 'sawtooth'); tone(150, .18, .023, 'sawtooth', .07); }
  if (name === 'success') { tone(523, .12, .028, 'sine'); tone(659, .14, .027, 'sine', .08); tone(784, .22, .025, 'sine', .16); }
  if (name === 'partial') { tone(440, .12, .02, 'triangle'); tone(554, .14, .02, 'triangle', .08); }
  if (name === 'victory') {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, .03, 'sine', i * .11));
  }
}

function musicPulse() {
  if (!audioPrefs.music || !audioCtx || audioCtx.state !== 'running') return;
  const roots = [220, 196, 174.61, 196];
  const root = roots[musicStep % roots.length];
  musicStep += 1;
  const ctx = audioCtx;
  const now = ctx.currentTime;
  [root, root * 1.5, root * 2].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(i === 0 ? .012 : .006, now + .5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 3);
  });
}

function startMusic() {
  if (!audioPrefs.music || musicTimer || !audioCtx) return;
  musicPulse();
  musicTimer = setInterval(musicPulse, 3000);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function updateAudioButtons() {
  musicBtn.classList.toggle('off', !audioPrefs.music);
  sfxBtn.classList.toggle('off', !audioPrefs.sfx);
  musicBtn.textContent = audioPrefs.music ? '♫' : '♩';
  sfxBtn.textContent = audioPrefs.sfx ? '🔊' : '🔇';
  musicBtn.title = audioPrefs.music ? 'Disattiva musica' : 'Attiva musica';
  sfxBtn.title = audioPrefs.sfx ? 'Disattiva effetti sonori' : 'Attiva effetti sonori';
}

musicBtn.onclick = () => {
  audioPrefs.music = !audioPrefs.music;
  saveAudioPrefs();
  ensureAudio();
  if (audioPrefs.music) startMusic(); else stopMusic();
  updateAudioButtons();
};

sfxBtn.onclick = () => {
  audioPrefs.sfx = !audioPrefs.sfx;
  saveAudioPrefs();
  ensureAudio();
  updateAudioButtons();
  if (audioPrefs.sfx) sfx('select');
};

document.addEventListener('pointerdown', () => ensureAudio(), { once: true });
updateAudioButtons();

function cardMetaFromId(id) {
  const index = Number(id) - 1;
  const slot = index % 16;
  return {
    id: Number(id),
    sheet: `/cards/sheet_${String(Math.floor(index / 16) + 1).padStart(2, '0')}.webp`,
    x: slot % 4,
    y: Math.floor(slot / 4),
    cols: 4,
    rows: 4
  };
}

function cardStyle(card) {
  const cols = Number(card.cols || 4);
  const rows = Number(card.rows || 4);
  const x = Number(card.x || 0);
  const y = Number(card.y || 0);
  const px = cols <= 1 ? 0 : (x * 100 / (cols - 1));
  const py = rows <= 1 ? 0 : (y * 100 / (rows - 1));
  return `background-image:url('${card.sheet}');background-size:${cols * 100}% ${rows * 100}%;background-position:${px}% ${py}%;`;
}

function cardArt(card, className = 'card-art') {
  return `<span class="${className}" style="${cardStyle(card)}"></span>`;
}

function cardButton(card, options = {}) {
  const selected = Number(selectedCardId) === Number(card.id);
  const disabled = Boolean(options.disabled);
  const wrong = Boolean(options.wrong);
  const classes = ['game-card'];
  if (selected) classes.push('selected');
  if (disabled) classes.push('disabled');
  if (wrong) classes.push('wrong');
  const tag = options.tag ? `<span class="card-tag">${esc(options.tag)}</span>` : '';
  return `<button class="${classes.join(' ')}" ${disabled ? 'disabled' : ''} data-card-id="${card.id}" type="button" aria-label="Carta illustrata ${card.id}">${cardArt(card)}${tag}</button>`;
}

function attachCardSelection(selector = '.game-card:not(:disabled)') {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener('click', () => {
      selectedCardId = Number(button.dataset.cardId);
      document.querySelectorAll('.game-card').forEach((el) => el.classList.remove('selected'));
      button.classList.add('selected');
      sfx('select');
    });
  });
}

function renderHome() {
  state = null;
  previousState = null;
  selectedCardId = null;
  roomBadge.classList.add('hidden');
  const previews = [cardMetaFromId(1), cardMetaFromId(70), cardMetaFromId(106)];
  screen.innerHTML = `
    <div class="hero">
      <div>
        <div class="eyebrow">106 carte · gioco online per due</div>
        <h1>Una carta.<br>Un indizio.<br>Due menti.</h1>
        <p class="lead">Scegliete immagini, inventate indizi e provate a capirvi. Potete collaborare oppure sfidarvi nel nuovo Duello a due tentativi.</p>
        <div class="hero-actions">
          <button class="btn primary" id="createBtn" type="button">Crea una stanza</button>
          <button class="btn secondary" id="joinBtn" type="button">Entra con codice</button>
        </div>
      </div>
      <div class="preview-stack" aria-hidden="true">
        ${previews.map((card) => `<div class="preview-card">${cardArt(card)}</div>`).join('')}
      </div>
    </div>`;
  document.getElementById('createBtn').onclick = () => { sfx('select'); renderCreate(); };
  document.getElementById('joinBtn').onclick = () => { sfx('select'); renderJoin(); };
}

function renderCreate() {
  selectedCardId = null;
  screen.innerHTML = `
    <div class="panel form-panel">
      <div class="eyebrow">Nuova partita</div>
      <h2>Crea la stanza</h2>
      <p class="lead">Scegliete se affrontarvi o giocare come squadra. Il secondo giocatore entrerà con un codice di 6 caratteri.</p>
      <div class="field">
        <label for="name">Il tuo nome</label>
        <input id="name" class="input" maxlength="24" autocomplete="nickname" placeholder="Es. Mattia" />
      </div>
      <div class="mode-grid">
        <button class="mode-card selected" data-mode="duel" type="button">
          <span class="mode-icon">⚔️</span><strong>Duello</strong>
          <p>Il narratore dà l'indizio e l'altro ha due tentativi per trovare la carta. Vince chi arriva a 12 punti.</p>
        </button>
        <button class="mode-card" data-mode="cooperative" type="button">
          <span class="mode-icon">🤝</span><strong>Cooperativa</strong>
          <p>Ognuno associa una carta e poi entrambi provano a riconoscere quella dell'altro per 10 round.</p>
        </button>
      </div>
      <div class="rule-note"><strong>Duello:</strong> indovinata al 1° tentativo = 2 punti all'indovinatore. Indovinata al 2° = 1 all'indovinatore e 2 al narratore. Due errori = 0 punti: quindi al narratore non conviene dare un indizio impossibile.</div>
      <div class="action-row">
        <button class="btn primary" id="confirmCreate" type="button">Crea stanza</button>
        <button class="btn" id="backHome" type="button">Indietro</button>
      </div>
    </div>`;

  document.querySelectorAll('.mode-card').forEach((button) => {
    button.onclick = () => {
      chosenMode = button.dataset.mode;
      document.querySelectorAll('.mode-card').forEach((el) => el.classList.toggle('selected', el === button));
      sfx('select');
    };
  });
  document.getElementById('backHome').onclick = renderHome;
  document.getElementById('confirmCreate').onclick = async () => {
    const name = document.getElementById('name').value.trim();
    if (!name) return showToast('Inserisci il tuo nome.');
    const res = await emitAck('create-room', { name, mode: chosenMode });
    if (!res.ok) return showToast(res.error);
    saveSession(res.roomCode, res.playerToken);
    sfx('action');
  };
}

function renderJoin() {
  screen.innerHTML = `
    <div class="panel form-panel">
      <div class="eyebrow">Entra in partita</div>
      <h2>Hai il codice?</h2>
      <p class="lead">Inserisci il codice mostrato sul dispositivo dell'altro giocatore.</p>
      <div class="field"><label for="joinName">Il tuo nome</label><input id="joinName" class="input" maxlength="24" autocomplete="nickname" placeholder="Es. Nicla" /></div>
      <div class="field"><label for="joinCode">Codice stanza</label><input id="joinCode" class="input code-input" maxlength="6" autocomplete="off" placeholder="ABC123" /></div>
      <div class="action-row"><button class="btn primary" id="confirmJoin" type="button">Entra</button><button class="btn" id="backHome" type="button">Indietro</button></div>
    </div>`;
  document.getElementById('backHome').onclick = renderHome;
  document.getElementById('confirmJoin').onclick = async () => {
    const name = document.getElementById('joinName').value.trim();
    const roomCode = document.getElementById('joinCode').value.trim().toUpperCase();
    if (!name) return showToast('Inserisci il tuo nome.');
    if (roomCode.length !== 6) return showToast('Il codice deve avere 6 caratteri.');
    const res = await emitAck('join-room', { name, roomCode });
    if (!res.ok) return showToast(res.error);
    saveSession(res.roomCode, res.playerToken);
    sfx('action');
  };
}

function renderWaiting() {
  const me = state.players[state.myIndex];
  screen.innerHTML = `
    <div class="waiting"><div class="panel waiting-card">
      <div class="eyebrow">${modeName(state.mode)}</div><h2>Stanza creata</h2>
      <p class="lead" style="margin-inline:auto">Invia questo codice al secondo giocatore.</p>
      <div class="room-code-big">${state.roomCode}</div>
      <button class="btn primary" id="copyCode" type="button">Copia codice</button>
      <div class="wait-note" style="justify-content:center;margin-top:20px"><span class="pulse"></span> ${esc(me.name)}, in attesa del secondo giocatore…</div>
      <div class="game-tools" style="justify-content:center"><button class="btn" id="refreshGameBtn" type="button">↻ Refresh</button><button class="btn danger" id="leaveBtn" type="button">Abbandona stanza</button></div>
    </div></div>`;
  document.getElementById('copyCode').onclick = async () => {
    await navigator.clipboard?.writeText(state.roomCode);
    showToast('Codice copiato.');
    sfx('action');
  };
  attachGameTools();
}

function scorebar() {
  const [p0, p1] = state.players;
  const center = state.mode === 'cooperative'
    ? `<div class="round-chip">Round<strong>${state.roundNumber}/10</strong></div>`
    : `<div class="round-chip">Turno<strong>${state.roundNumber}</strong><span>· a ${state.duelTarget}</span></div>`;
  const roleOther = state.mode === 'cooperative' ? 'Associatore' : 'Indovinatore';
  function playerChip(player, index) {
    const role = index === state.storytellerIndex ? 'Narratore' : roleOther;
    const status = player.connected ? role : 'Disconnesso';
    const score = state.mode === 'duel' ? `<div class="score">${player.score}</div>` : '';
    return `<div class="player-chip"><div class="player-name">${esc(player.name)}${index === state.myIndex ? ' · Tu' : ''}</div><div class="player-status">${status}</div>${score}</div>`;
  }
  return `<div class="scorebar">${playerChip(p0, 0)}${center}${playerChip(p1, 1)}</div>`;
}

function gameShell(content) {
  return `<div class="game-layout">${scorebar()}<div class="panel stage">${content}</div><div class="game-tools"><button class="btn" id="refreshGameBtn" type="button">↻ Refresh</button><button class="btn danger" id="leaveBtn" type="button">Abbandona partita</button></div></div>`;
}

function attachGameTools() {
  const refresh = document.getElementById('refreshGameBtn');
  const leave = document.getElementById('leaveBtn');
  if (refresh) refresh.onclick = () => { sfx('select'); window.location.reload(); };
  if (leave) leave.onclick = leaveRoom;
}

function renderStorytellerSelect() {
  const isMe = state.isStoryteller;
  const other = state.players[1 - state.myIndex];
  const duelText = 'Scegli una carta e scrivi un indizio. L’altro vedrà la tua carta mescolata con cinque carte-esca e avrà due tentativi.';
  const coopText = 'Scegli una carta e scrivi un indizio. L’altro dovrà associare una propria carta allo stesso indizio.';
  const content = isMe ? `
    <div class="stage-head"><div><div class="eyebrow">Sei il narratore</div><h2>Scegli la tua carta</h2><p>${state.mode === 'duel' ? duelText : coopText}</p></div></div>
    <div class="hand-title"><div><strong>La tua mano</strong><p>Hai ${state.myHand.length} carte</p></div></div>
    <div class="card-grid">${state.myHand.map((card) => cardButton(card)).join('')}</div>
    <div class="inline-form"><input id="clueInput" class="input" maxlength="120" placeholder="Scrivi il tuo indizio…" /><button id="storySubmit" class="btn primary" type="button">Conferma carta e indizio</button></div>` : `
    <div class="stage-head"><div><div class="eyebrow">Turno di ${esc(other.name)}</div><h2>Il narratore sta pensando…</h2><p>Aspetta che scelga una carta e scriva il suo indizio.</p></div></div>
    <div class="wait-note"><span class="pulse"></span> In attesa dell'indizio</div>`;
  screen.innerHTML = gameShell(content);
  attachGameTools();
  if (!isMe) return;
  attachCardSelection();
  document.getElementById('storySubmit').onclick = async () => {
    const clue = document.getElementById('clueInput').value.trim();
    if (!selectedCardId) return showToast('Prima scegli una carta.');
    if (!clue) return showToast('Scrivi un indizio.');
    const res = await emitAck('storyteller-submit', { cardId: selectedCardId, clue });
    if (!res.ok) showToast(res.error);
    else { selectedCardId = null; sfx('clue'); }
  };
}

function renderResponderSelect() {
  const isMeResponder = !state.isStoryteller;
  const other = state.players[1 - state.myIndex];
  const content = isMeResponder ? `
    <div class="stage-head"><div><div class="eyebrow">Associa una carta</div><h2>Quale tua immagine parla di questo indizio?</h2><p>Scegli quella che secondo te si mimetizzerà meglio insieme alla carta del narratore e alle quattro carte-esca.</p></div></div>
    <div class="clue-box"><span>Indizio</span><strong>${esc(state.clue)}</strong></div>
    <div class="card-grid">${state.myHand.map((card) => cardButton(card)).join('')}</div>
    <div class="action-row"><button id="responseSubmit" class="btn primary" type="button">Gioca la carta scelta</button></div>` : `
    <div class="stage-head"><div><div class="eyebrow">Indizio inviato</div><h2>${esc(other.name)} sta scegliendo</h2><p>Ora l'altro giocatore deve trovare nella propria mano una carta che possa adattarsi al tuo indizio.</p></div></div>
    <div class="clue-box"><span>Il tuo indizio</span><strong>${esc(state.clue)}</strong></div>
    <div class="wait-note"><span class="pulse"></span> In attesa della carta dell'altro giocatore</div>`;
  screen.innerHTML = gameShell(content);
  attachGameTools();
  if (!isMeResponder) return;
  attachCardSelection();
  document.getElementById('responseSubmit').onclick = async () => {
    if (!selectedCardId) return showToast('Scegli una carta.');
    const res = await emitAck('responder-submit', { cardId: selectedCardId });
    if (!res.ok) showToast(res.error);
    else { selectedCardId = null; sfx('deal'); }
  };
}

function renderDuelGuess() {
  const isGuesser = !state.isStoryteller;
  const storyteller = state.players[state.storytellerIndex];
  const guesses = state.duelGuesses || [];
  if (!isGuesser) {
    const text = guesses.length === 0
      ? 'L’altro giocatore sta scegliendo il primo tentativo.'
      : 'Il primo tentativo era sbagliato: adesso ha un’ultima possibilità.';
    screen.innerHTML = gameShell(`
      <div class="stage-head"><div><div class="eyebrow">Indizio inviato</div><h2>${esc(state.players[1 - state.storytellerIndex].name)} sta cercando la tua carta</h2><p>${text}</p></div></div>
      <div class="clue-box"><span>Il tuo indizio</span><strong>${esc(state.clue)}</strong></div>
      <div class="wait-note"><span class="pulse"></span> ${guesses.length === 0 ? 'Primo tentativo in corso' : 'Secondo tentativo in corso'}</div>`);
    attachGameTools();
    return;
  }

  const tableCards = state.table.map((card) => {
    const wasWrong = guesses.includes(card.id);
    return cardButton(card, { disabled: wasWrong, wrong: wasWrong, tag: wasWrong ? '1° tentativo ✕' : '' });
  }).join('');
  const attempt = guesses.length + 1;
  const explanation = attempt === 1
    ? `Se la trovi subito prendi 2 punti.`
    : `Ultimo tentativo: se la trovi tu prendi 1 punto e ${esc(storyteller.name)} ne prende 2 per un indizio ben calibrato.`;

  screen.innerHTML = gameShell(`
    <div class="stage-head"><div><div class="eyebrow">Duello · tentativo ${attempt}/2</div><h2>Qual è la carta di ${esc(storyteller.name)}?</h2><p>Tra queste sei immagini ce n'è una scelta dal narratore e cinque pescate casualmente.</p></div></div>
    <div class="clue-box"><span>Indizio</span><strong>${esc(state.clue)}</strong></div>
    <div class="attempt-banner"><span>${explanation}</span><strong>${attempt === 1 ? '2 pt' : '1 + 2 pt'}</strong></div>
    <div class="card-grid table-grid">${tableCards}</div>
    <div class="action-row"><button id="duelGuessBtn" class="btn primary" type="button">Conferma tentativo ${attempt}</button></div>`);
  attachGameTools();
  attachCardSelection();
  document.getElementById('duelGuessBtn').onclick = async () => {
    if (!selectedCardId) return showToast('Scegli una carta.');
    const res = await emitAck('duel-guess', { cardId: selectedCardId });
    if (!res.ok) return showToast(res.error);
    if (!res.correct && res.attempt === 1) {
      sfx('wrong');
      showToast('Non è quella. Hai ancora un tentativo!');
    }
    selectedCardId = null;
  };
}

function renderVoting() {
  const targetText = state.isStoryteller ? 'Trova la carta scelta dall’altro giocatore.' : 'Trova la carta originale del narratore.';
  const alreadyVoted = state.myVote !== null;
  const tableCards = state.table.map((card) => cardButton(card, {
    disabled: alreadyVoted,
    tag: Number(state.myVote) === Number(card.id) ? 'La tua scelta' : ''
  })).join('');
  screen.innerHTML = gameShell(`
    <div class="stage-head"><div><div class="eyebrow">Votazione cooperativa</div><h2>Sei carte. Una risposta.</h2><p>${targetText} Le altre quattro immagini sono carte-esca pescate automaticamente.</p></div></div>
    <div class="clue-box"><span>Indizio</span><strong>${esc(state.clue)}</strong></div>
    <div class="card-grid table-grid">${tableCards}</div>
    ${alreadyVoted ? `<div class="wait-note"><span class="pulse"></span> Voto registrato. ${state.otherHasVoted ? 'Anche l’altro ha votato…' : 'Aspettiamo l’altro giocatore.'}</div>` : '<div class="action-row"><button id="voteBtn" class="btn primary" type="button">Vota questa carta</button></div>'}`);
  attachGameTools();
  if (alreadyVoted) return;
  attachCardSelection();
  document.getElementById('voteBtn').onclick = async () => {
    if (!selectedCardId) return showToast('Scegli la carta che vuoi votare.');
    const res = await emitAck('vote', { cardId: selectedCardId });
    if (!res.ok) showToast(res.error);
    else { selectedCardId = null; sfx('action'); }
  };
}

function cardFromTable(id) {
  return state.table?.find((card) => Number(card.id) === Number(id)) || cardMetaFromId(id);
}

function miniFigure(card, caption) {
  return `<figure><div class="mini-card">${cardArt(card)}</div><figcaption>${caption}</figcaption></figure>`;
}

function resultsFooter() {
  if (state.status === 'finished') {
    return `<div class="gameover"><div class="trophy">${state.mode === 'duel' ? '🏆' : '✨'}</div><h2>${esc(state.gameOver?.label || 'Partita conclusa')}</h2><p>${esc(state.gameOver?.message || '')}</p><div class="action-row" style="justify-content:center"><button class="btn primary" id="restartBtn" type="button">Rigioca</button></div></div>`;
  }
  const ready = state.players[state.myIndex].nextReady;
  return `<div class="action-row"><button class="btn primary" id="nextBtn" type="button">${ready ? 'Pronto ✓' : 'Pronto per il prossimo turno'}</button></div>${ready ? '<div class="wait-note"><span class="pulse"></span> Aspettiamo che anche l’altro sia pronto.</div>' : ''}`;
}

function attachResultsFooter() {
  if (state.status === 'finished') {
    document.getElementById('restartBtn').onclick = async () => {
      const res = await emitAck('restart-game');
      if (!res.ok) showToast(res.error); else sfx('action');
    };
  } else {
    document.getElementById('nextBtn').onclick = async () => {
      const res = await emitAck('next-round-ready');
      if (!res.ok) showToast(res.error); else sfx('select');
    };
  }
}

function renderDuelResults() {
  const r = state.results;
  const storyteller = state.players[state.storytellerIndex];
  const responder = state.players[1 - state.storytellerIndex];
  const storyCard = cardFromTable(r.storytellerCard);
  let title = '';
  let detail = '';
  if (r.outcome === 'first') {
    title = `${esc(responder.name)} l'ha trovata subito!`;
    detail = `${esc(responder.name)} prende 2 punti. ${esc(storyteller.name)} non prende punti: l'indizio era molto diretto.`;
  } else if (r.outcome === 'second') {
    title = 'Indovinata al secondo tentativo!';
    detail = `${esc(responder.name)} prende 1 punto e ${esc(storyteller.name)} prende 2 punti: l'indizio era difficile ma comprensibile.`;
  } else {
    title = 'La carta è rimasta nascosta';
    detail = 'Due tentativi sbagliati: nessuno prende punti. Un indizio troppo difficile non premia il narratore.';
  }
  const guessedFigures = (r.guesses || []).map((id, i) => miniFigure(cardFromTable(id), `${i + 1}° tentativo${id === r.storytellerCard ? ' · corretto' : ' · sbagliato'}`)).join('');
  screen.innerHTML = gameShell(`
    <div class="stage-head"><div><div class="eyebrow">Risultato del Duello</div><h2>${title}</h2><p>${detail}</p></div></div>
    <div class="clue-box"><span>Indizio</span><strong>${esc(r.clue)}</strong></div>
    <div class="mini-reveal">${miniFigure(storyCard, `Carta del narratore · ${esc(storyteller.name)}`)}${guessedFigures}</div>
    <div class="result-grid">
      <div class="result-card"><strong>${esc(state.players[0].name)}</strong><p>+${r.gained[0]} punti · totale ${r.afterScores[0]}</p></div>
      <div class="result-card"><strong>${esc(state.players[1].name)}</strong><p>+${r.gained[1]} punti · totale ${r.afterScores[1]}</p></div>
    </div>
    ${resultsFooter()}`);
  attachGameTools();
  attachResultsFooter();
}

function renderCoopResults() {
  const r = state.results;
  const storyteller = state.players[state.storytellerIndex];
  const responder = state.players[1 - state.storytellerIndex];
  const storyCard = cardFromTable(r.storytellerCard);
  const responseCard = cardFromTable(r.responderCard);
  const perfect = r.storytellerCorrect && r.responderCorrect;
  const none = !r.storytellerCorrect && !r.responderCorrect;
  const outcome = perfect ? '✨ Round perfetto' : (none ? '✕ Entrambi fuori strada' : '◐ Intesa parziale');
  screen.innerHTML = gameShell(`
    <div class="stage-head"><div><div class="eyebrow">Risultato cooperativo</div><h2>${outcome}</h2><p>Continuate a costruire la vostra sintonia per tutti e 10 i round.</p></div></div>
    <div class="clue-box"><span>Indizio</span><strong>${esc(r.clue)}</strong></div>
    <div class="mini-reveal">${miniFigure(storyCard, `Carta del narratore · ${esc(storyteller.name)}`)}${miniFigure(responseCard, `Carta associata · ${esc(responder.name)}`)}</div>
    <div class="result-grid">
      <div class="result-card ${r.responderCorrect ? 'good' : 'bad'}"><strong>${esc(responder.name)}</strong><p>${r.responderCorrect ? 'Ha trovato la carta del narratore.' : 'Non ha trovato la carta del narratore.'}</p></div>
      <div class="result-card ${r.storytellerCorrect ? 'good' : 'bad'}"><strong>${esc(storyteller.name)}</strong><p>${r.storytellerCorrect ? 'Ha riconosciuto la carta associata.' : 'Non ha riconosciuto la carta associata.'}</p></div>
    </div>
    <div class="result-card ${perfect ? 'good' : ''}"><strong>Partita</strong><p>Perfetti ${state.coop.successes} · Parziali ${state.coop.partials} · Doppi errori ${state.coop.errors}</p></div>
    ${resultsFooter()}`);
  attachGameTools();
  attachResultsFooter();
}

function renderResults() {
  if (!state.results) return;
  if (state.mode === 'duel') renderDuelResults(); else renderCoopResults();
}

function playStateSound(prev, next) {
  if (!prev || !next) return;
  if (next.status === 'finished' && prev.status !== 'finished') return sfx('victory');
  if (next.phase === 'results' && prev.phase !== 'results') {
    if (next.mode === 'duel') {
      sfx(next.results?.outcome === 'miss' ? 'wrong' : 'success');
    } else if (next.results?.storytellerCorrect && next.results?.responderCorrect) sfx('success');
    else if (!next.results?.storytellerCorrect && !next.results?.responderCorrect) sfx('wrong');
    else sfx('partial');
    return;
  }
  if (next.phase === 'responder_select' && prev.phase === 'storyteller_select') sfx('clue');
  if (next.phase === 'duel_guess' && prev.phase === 'storyteller_select') sfx('clue');
  if (next.phase === 'voting' && prev.phase === 'responder_select') sfx('deal');
}

function renderState() {
  if (!state) return renderHome();
  roomBadge.innerHTML = `${modeName(state.mode)} · <strong>${state.roomCode}</strong>`;
  roomBadge.classList.remove('hidden');
  selectedCardId = null;
  if (state.status === 'waiting') return renderWaiting();
  if (state.phase === 'storyteller_select') return renderStorytellerSelect();
  if (state.phase === 'responder_select') return renderResponderSelect();
  if (state.phase === 'duel_guess') return renderDuelGuess();
  if (state.phase === 'voting') return renderVoting();
  if (state.phase === 'results') return renderResults();
}

async function leaveRoom() {
  const res = await emitAck('leave-room');
  if (!res.ok) return showToast(res.error);
  clearSession();
  sfx('select');
  renderHome();
}

socket.on('state', (newState) => {
  previousState = state;
  state = newState;
  playStateSound(previousState, state);
  renderState();
});

socket.on('connect', async () => {
  const saved = session();
  if (!saved) return renderHome();
  const res = await emitAck('resume-room', saved);
  if (!res.ok) {
    clearSession();
    renderHome();
  }
});

socket.on('room-closed', (payload = {}) => {
  clearSession();
  state = null;
  renderHome();
  showToast(payload.message || 'La stanza è stata chiusa.');
  sfx('wrong');
});

socket.on('disconnect', () => {
  if (state) showToast('Connessione persa. Provo a riconnettermi…');
});

brand.addEventListener('click', () => {
  if (state) showToast('Per tornare alla home usa “Abbandona partita”.');
  else renderHome();
});
