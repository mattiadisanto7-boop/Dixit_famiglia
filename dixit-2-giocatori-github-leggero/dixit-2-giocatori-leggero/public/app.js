const socket = io();

const screen = document.getElementById('screen');
const roomBadge = document.getElementById('roomBadge');
const toast = document.getElementById('toast');
const brand = document.getElementById('brand');

let state = null;
let selectedCardId = null;
let chosenMode = 'competitive';
let toastTimer = null;

const previewCards = ['/cards/card_001.webp', '/cards/card_010.webp', '/cards/card_035.webp'];

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

function emitAck(event, payload = {}) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response || { ok: false, error: 'Nessuna risposta dal server.' }));
  });
}

function modeName(mode) {
  return mode === 'cooperative' ? 'Cooperativa' : 'Competitiva';
}

function cardButton(card, options = {}) {
  const selected = Number(selectedCardId) === Number(card.id);
  const disabled = Boolean(options.disabled);
  const extra = selected ? ' selected' : '';
  const disabledClass = disabled ? ' disabled' : '';
  const tag = options.tag ? `<span class="card-tag">${esc(options.tag)}</span>` : '';
  return `
    <button class="game-card${extra}${disabledClass}" ${disabled ? 'disabled' : ''} data-card-id="${card.id}" type="button">
      <img src="${card.file}" alt="Carta illustrata ${card.id}" loading="lazy" />
      ${tag}
    </button>`;
}

function attachCardSelection(selector = '.game-card:not(:disabled)') {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener('click', () => {
      selectedCardId = Number(button.dataset.cardId);
      document.querySelectorAll('.game-card').forEach((el) => el.classList.remove('selected'));
      button.classList.add('selected');
    });
  });
}

function renderHome() {
  state = null;
  selectedCardId = null;
  roomBadge.classList.add('hidden');
  screen.innerHTML = `
    <div class="hero">
      <div>
        <div class="eyebrow">Gioco online per due</div>
        <h1>Una carta.<br>Un indizio.<br>Due menti.</h1>
        <p class="lead">Scegliete immagini, inventate indizi e provate a riconoscervi tra le carte-esca. Giocate insieme oppure uno contro l'altro.</p>
        <div class="hero-actions">
          <button class="btn primary" id="createBtn" type="button">Crea una stanza</button>
          <button class="btn secondary" id="joinBtn" type="button">Entra con codice</button>
        </div>
      </div>
      <div class="preview-stack" aria-hidden="true">
        ${previewCards.map((src) => `<div class="preview-card"><img src="${src}" alt="" /></div>`).join('')}
      </div>
    </div>`;

  document.getElementById('createBtn').onclick = () => renderCreate();
  document.getElementById('joinBtn').onclick = () => renderJoin();
}

function renderCreate() {
  selectedCardId = null;
  screen.innerHTML = `
    <div class="panel form-panel">
      <div class="eyebrow">Nuova partita</div>
      <h2>Crea la stanza</h2>
      <p class="lead">Scegli la modalità. Il secondo giocatore entrerà con un codice di 6 caratteri.</p>
      <div class="field">
        <label for="name">Il tuo nome</label>
        <input id="name" class="input" maxlength="24" autocomplete="nickname" placeholder="Es. Mattia" />
      </div>
      <div class="mode-grid">
        <button class="mode-card selected" data-mode="competitive" type="button">
          <span class="mode-icon">⚔️</span><strong>Competitiva</strong>
          <p>Guadagnate punti individuali. Il primo che supera 20 con un vantaggio vince.</p>
        </button>
        <button class="mode-card" data-mode="cooperative" type="button">
          <span class="mode-icon">🤝</span><strong>Cooperativa</strong>
          <p>Avete 10 round per capire quanto riuscite a leggervi a vicenda.</p>
        </button>
      </div>
      <div class="action-row">
        <button class="btn primary" id="confirmCreate" type="button">Crea stanza</button>
        <button class="btn" id="backHome" type="button">Indietro</button>
      </div>
    </div>`;

  document.querySelectorAll('.mode-card').forEach((button) => {
    button.onclick = () => {
      chosenMode = button.dataset.mode;
      document.querySelectorAll('.mode-card').forEach((el) => el.classList.toggle('selected', el === button));
    };
  });
  document.getElementById('backHome').onclick = renderHome;
  document.getElementById('confirmCreate').onclick = async () => {
    const name = document.getElementById('name').value.trim();
    if (!name) return showToast('Inserisci il tuo nome.');
    const res = await emitAck('create-room', { name, mode: chosenMode });
    if (!res.ok) return showToast(res.error);
    saveSession(res.roomCode, res.playerToken);
  };
}

function renderJoin() {
  screen.innerHTML = `
    <div class="panel form-panel">
      <div class="eyebrow">Entra in partita</div>
      <h2>Hai il codice?</h2>
      <p class="lead">Inserisci il codice mostrato sul dispositivo dell'altro giocatore.</p>
      <div class="field">
        <label for="joinName">Il tuo nome</label>
        <input id="joinName" class="input" maxlength="24" autocomplete="nickname" placeholder="Es. Nicla" />
      </div>
      <div class="field">
        <label for="joinCode">Codice stanza</label>
        <input id="joinCode" class="input code-input" maxlength="6" autocomplete="off" placeholder="ABC123" />
      </div>
      <div class="action-row">
        <button class="btn primary" id="confirmJoin" type="button">Entra</button>
        <button class="btn" id="backHome" type="button">Indietro</button>
      </div>
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
  };
}

function renderWaiting() {
  const me = state.players[state.myIndex];
  screen.innerHTML = `
    <div class="waiting">
      <div class="panel waiting-card">
        <div class="eyebrow">${modeName(state.mode)}</div>
        <h2>Stanza creata</h2>
        <p class="lead" style="margin-inline:auto">Invia questo codice al secondo giocatore.</p>
        <div class="room-code-big">${state.roomCode}</div>
        <button class="btn primary" id="copyCode" type="button">Copia codice</button>
        <div class="wait-note" style="justify-content:center;margin-top:20px"><span class="pulse"></span> ${esc(me.name)}, in attesa del secondo giocatore…</div>
        <button class="btn danger" id="leaveBtn" type="button">Abbandona stanza</button>
      </div>
    </div>`;

  document.getElementById('copyCode').onclick = async () => {
    await navigator.clipboard?.writeText(state.roomCode);
    showToast('Codice copiato.');
  };
  document.getElementById('leaveBtn').onclick = leaveRoom;
}

function scorebar() {
  const [p0, p1] = state.players;
  const center = state.mode === 'cooperative'
    ? `<div class="round-chip">Round<strong>${state.roundNumber}/10</strong></div>`
    : `<div class="round-chip">Round<strong>${state.roundNumber}</strong></div>`;

  function playerChip(player, index) {
    const role = index === state.storytellerIndex ? 'Narratore' : 'Associatore';
    const status = player.connected ? role : 'Disconnesso';
    const score = state.mode === 'competitive' ? `<div class="score">${player.score}</div>` : '';
    return `<div class="player-chip"><div class="player-name">${esc(player.name)}${index === state.myIndex ? ' · Tu' : ''}</div><div class="player-status">${status}</div>${score}</div>`;
  }

  return `<div class="scorebar">${playerChip(p0, 0)}${center}${playerChip(p1, 1)}</div>`;
}

function coopStrip() {
  if (state.mode !== 'cooperative') return '';
  return `<div class="player-chip" style="display:flex;justify-content:center;gap:18px;text-align:center"><span>✨ Perfetti <strong>${state.coop.successes}</strong></span><span>◐ Parziali <strong>${state.coop.partials}</strong></span><span>✕ Doppi errori <strong>${state.coop.errors}</strong></span></div>`;
}

function gameShell(stageHtml) {
  return `<div class="game-layout">${scorebar()}${coopStrip()}<div class="panel stage">${stageHtml}</div><button class="btn danger" id="leaveBtn" type="button" style="justify-self:start">Abbandona partita</button></div>`;
}

function renderStorytellerSelect() {
  const isMe = state.isStoryteller;
  const other = state.players[1 - state.myIndex];
  const content = isMe ? `
    <div class="stage-head"><div><div class="eyebrow">Tocca a te</div><h2>Sei il narratore</h2><p>Scegli una carta dalla tua mano e scrivi un indizio. Può essere una parola, una frase, un ricordo o un'idea.</p></div></div>
    <div class="hand-title"><h3>La tua mano</h3><p>Scegli 1 carta</p></div>
    <div class="card-grid">${state.myHand.map((card) => cardButton(card)).join('')}</div>
    <div class="inline-form"><input id="clueInput" class="input" maxlength="120" placeholder="Scrivi il tuo indizio…" /><button id="storySubmit" class="btn primary" type="button">Conferma carta e indizio</button></div>` : `
    <div class="stage-head"><div><div class="eyebrow">Round ${state.roundNumber}</div><h2>${esc(other.name)} sta pensando…</h2><p>Il narratore sta scegliendo una carta e preparando l'indizio. La tua mano resta visibile, ma non puoi ancora giocare.</p></div></div>
    <div class="wait-note"><span class="pulse"></span> In attesa dell'indizio</div>
    <div class="hand-title"><h3>La tua mano</h3></div>
    <div class="card-grid">${state.myHand.map((card) => cardButton(card, { disabled: true })).join('')}</div>`;

  screen.innerHTML = gameShell(content);
  document.getElementById('leaveBtn').onclick = leaveRoom;
  if (!isMe) return;
  attachCardSelection();
  document.getElementById('storySubmit').onclick = async () => {
    const clue = document.getElementById('clueInput').value.trim();
    if (!selectedCardId) return showToast('Prima scegli una carta.');
    if (!clue) return showToast('Scrivi un indizio.');
    const res = await emitAck('storyteller-submit', { cardId: selectedCardId, clue });
    if (!res.ok) showToast(res.error);
    else selectedCardId = null;
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
  document.getElementById('leaveBtn').onclick = leaveRoom;
  if (!isMeResponder) return;
  attachCardSelection();
  document.getElementById('responseSubmit').onclick = async () => {
    if (!selectedCardId) return showToast('Scegli una carta.');
    const res = await emitAck('responder-submit', { cardId: selectedCardId });
    if (!res.ok) showToast(res.error);
    else selectedCardId = null;
  };
}

function renderVoting() {
  const targetText = state.isStoryteller
    ? 'Trova la carta scelta dall’altro giocatore.'
    : 'Trova la carta originale del narratore.';
  const alreadyVoted = state.myVote !== null;
  const tableCards = state.table.map((card) => cardButton(card, {
    disabled: alreadyVoted,
    tag: Number(state.myVote) === Number(card.id) ? 'La tua scelta' : ''
  })).join('');

  screen.innerHTML = gameShell(`
    <div class="stage-head"><div><div class="eyebrow">Votazione</div><h2>Sei carte. Una risposta.</h2><p>${targetText} Le altre quattro immagini sono carte-esca pescate automaticamente.</p></div></div>
    <div class="clue-box"><span>Indizio</span><strong>${esc(state.clue)}</strong></div>
    <div class="card-grid table-grid">${tableCards}</div>
    ${alreadyVoted ? `<div class="wait-note"><span class="pulse"></span> Voto registrato. ${state.otherHasVoted ? 'Anche l’altro ha votato…' : 'Aspettiamo l’altro giocatore.'}</div>` : '<div class="action-row"><button id="voteBtn" class="btn primary" type="button">Vota questa carta</button></div>'}
  `);
  document.getElementById('leaveBtn').onclick = leaveRoom;
  if (alreadyVoted) return;
  attachCardSelection();
  document.getElementById('voteBtn').onclick = async () => {
    if (!selectedCardId) return showToast('Scegli la carta che vuoi votare.');
    const res = await emitAck('vote', { cardId: selectedCardId });
    if (!res.ok) showToast(res.error);
    else selectedCardId = null;
  };
}

function revealCard(id) {
  return state.table?.find((card) => Number(card.id) === Number(id)) || state.myHand.find((card) => Number(card.id) === Number(id)) || { id, file: `/cards/card_${String(id).padStart(3, '0')}.webp` };
}

function renderResults() {
  const r = state.results;
  if (!r) return;
  const storyteller = state.players[state.storytellerIndex];
  const responder = state.players[1 - state.storytellerIndex];
  const storyCard = state.table.find((c) => c.id === r.storytellerCard);
  const responseCard = state.table.find((c) => c.id === r.responderCard);
  const myCorrect = state.myIndex === state.storytellerIndex ? r.storytellerCorrect : r.responderCorrect;
  const otherCorrect = state.myIndex === state.storytellerIndex ? r.responderCorrect : r.storytellerCorrect;

  let scoreText = '';
  if (state.mode === 'competitive') {
    scoreText = `<div class="result-grid">
      <div class="result-card"><strong>${esc(state.players[0].name)}</strong><p>+${r.gained[0]} punti · totale ${r.afterScores[0]}</p></div>
      <div class="result-card"><strong>${esc(state.players[1].name)}</strong><p>+${r.gained[1]} punti · totale ${r.afterScores[1]}</p></div>
    </div>`;
  } else {
    const outcome = r.storytellerCorrect && r.responderCorrect ? '✨ Round perfetto' : (!r.storytellerCorrect && !r.responderCorrect ? '✕ Entrambi fuori strada' : '◐ Intesa parziale');
    scoreText = `<div class="result-card ${r.storytellerCorrect && r.responderCorrect ? 'good' : ''}"><strong>${outcome}</strong><p>Perfetti ${state.coop.successes} · Parziali ${state.coop.partials} · Doppi errori ${state.coop.errors}</p></div>`;
  }

  const gameOverHtml = state.status === 'finished' ? `
    <div class="gameover">
      <div class="trophy">${state.mode === 'competitive' ? '🏆' : '✨'}</div>
      <h2>${esc(state.gameOver?.label || 'Partita conclusa')}</h2>
      <p>${esc(state.gameOver?.message || '')}</p>
      <div class="action-row" style="justify-content:center"><button class="btn primary" id="restartBtn" type="button">Rigioca</button></div>
    </div>` : `
    <div class="action-row"><button class="btn primary" id="nextBtn" type="button">${state.players[state.myIndex].nextReady ? 'Pronto ✓' : 'Pronto per il prossimo round'}</button></div>
    ${state.players[state.myIndex].nextReady ? '<div class="wait-note"><span class="pulse"></span> Aspettiamo che anche l’altro sia pronto.</div>' : ''}`;

  screen.innerHTML = gameShell(`
    <div class="stage-head"><div><div class="eyebrow">Risultato</div><h2>${myCorrect ? 'Hai indovinato!' : 'Questa volta no.'}</h2><p>${otherCorrect ? 'Anche l’altro giocatore ha trovato la carta giusta.' : 'L’altro giocatore non ha trovato la carta giusta.'}</p></div></div>
    <div class="clue-box"><span>Indizio del round</span><strong>${esc(r.clue)}</strong></div>
    <div class="mini-reveal">
      <figure><img src="${storyCard.file}" alt="Carta del narratore" /><figcaption>Carta del narratore · ${esc(storyteller.name)}</figcaption></figure>
      <figure><img src="${responseCard.file}" alt="Carta associata" /><figcaption>Carta associata · ${esc(responder.name)}</figcaption></figure>
    </div>
    <div class="result-grid">
      <div class="result-card ${r.responderCorrect ? 'good' : 'bad'}"><strong>${esc(responder.name)}</strong><p>${r.responderCorrect ? 'Ha trovato la carta del narratore.' : 'Non ha trovato la carta del narratore.'}</p></div>
      <div class="result-card ${r.storytellerCorrect ? 'good' : 'bad'}"><strong>${esc(storyteller.name)}</strong><p>${r.storytellerCorrect ? 'Ha riconosciuto la carta associata.' : 'Non ha riconosciuto la carta associata.'}</p></div>
    </div>
    ${scoreText}
    ${gameOverHtml}
  `);

  document.getElementById('leaveBtn').onclick = leaveRoom;
  if (state.status === 'finished') {
    document.getElementById('restartBtn').onclick = async () => {
      const res = await emitAck('restart-game');
      if (!res.ok) showToast(res.error);
    };
  } else {
    document.getElementById('nextBtn').onclick = async () => {
      const res = await emitAck('next-round-ready');
      if (!res.ok) showToast(res.error);
    };
  }
}

function renderState() {
  if (!state) return renderHome();
  roomBadge.innerHTML = `${modeName(state.mode)} · <strong>${state.roomCode}</strong>`;
  roomBadge.classList.remove('hidden');
  selectedCardId = null;

  if (state.status === 'waiting') return renderWaiting();
  if (state.phase === 'storyteller_select') return renderStorytellerSelect();
  if (state.phase === 'responder_select') return renderResponderSelect();
  if (state.phase === 'voting') return renderVoting();
  if (state.phase === 'results') return renderResults();
}

async function leaveRoom() {
  await emitAck('leave-room');
  clearSession();
  renderHome();
}

socket.on('state', (newState) => {
  state = newState;
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
});

socket.on('disconnect', () => {
  showToast('Connessione persa. Provo a riconnettermi…');
});

brand.addEventListener('click', () => {
  if (state) showToast('Per tornare alla home usa “Abbandona partita”.');
  else renderHome();
});
