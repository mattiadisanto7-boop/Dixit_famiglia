const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 20000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const publicDir = path.join(__dirname, 'public');
const cardsManifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'cards.json'), 'utf8'));

const CARDS = cardsManifest.map((card) => ({
  id: Number(card.id),
  sheet: `/${card.sheet}`,
  x: Number(card.x),
  y: Number(card.y),
  cols: Number(card.cols || 4),
  rows: Number(card.rows || 4)
}));
const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
const ALL_CARD_IDS = CARDS.map((card) => card.id);
const rooms = new Map();

app.use(express.static(publicDir));
app.get('/health', (_req, res) => res.status(200).json({ ok: true, cards: CARDS.length }));

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function cleanName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return name.slice(0, 24) || 'Giocatore';
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function token() {
  return crypto.randomBytes(18).toString('hex');
}

function cardData(id) {
  return CARD_BY_ID.get(Number(id)) || null;
}

function newCurrent() {
  return {
    clue: '',
    storytellerCard: null,
    responderCard: null,
    decoys: [],
    table: [],
    votes: [null, null],
    duelGuesses: [],
    results: null
  };
}

function makeRoom(mode, creatorName, socket) {
  const code = roomCode();
  const creatorToken = token();
  const room = {
    code,
    mode: mode === 'cooperative' ? 'cooperative' : 'duel',
    status: 'waiting',
    phase: 'waiting',
    players: [{
      token: creatorToken,
      socketId: socket.id,
      name: cleanName(creatorName),
      connected: true,
      hand: [],
      score: 0,
      nextReady: false
    }],
    deck: [],
    discard: [],
    storytellerIndex: 0,
    roundNumber: 0,
    coop: { successes: 0, partials: 0, errors: 0 },
    current: null,
    gameOver: null,
    lastActivity: Date.now()
  };
  rooms.set(code, room);
  return { room, creatorToken };
}

function touch(room) {
  room.lastActivity = Date.now();
}

function refillDeck(room) {
  if (room.deck.length > 0) return;
  const unavailable = new Set(room.players.flatMap((p) => p.hand));
  if (room.current) {
    if (room.current.storytellerCard) unavailable.add(room.current.storytellerCard);
    if (room.current.responderCard) unavailable.add(room.current.responderCard);
    for (const id of room.current.decoys || []) unavailable.add(id);
  }
  const refill = room.discard.filter((id) => !unavailable.has(id));
  room.discard = [];
  room.deck = shuffle(refill);
}

function draw(room, count = 1) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    refillDeck(room);
    if (!room.deck.length) break;
    result.push(room.deck.pop());
  }
  return result;
}

function dealInitial(room) {
  room.deck = shuffle(ALL_CARD_IDS);
  room.discard = [];
  room.players.forEach((player) => {
    player.hand = draw(room, 6);
    player.score = 0;
    player.nextReady = false;
  });
}

function startGame(room) {
  dealInitial(room);
  room.status = 'playing';
  room.phase = 'storyteller_select';
  room.storytellerIndex = crypto.randomInt(0, 2);
  room.roundNumber = 1;
  room.coop = { successes: 0, partials: 0, errors: 0 };
  room.current = newCurrent();
  room.gameOver = null;
  room.players.forEach((p) => { p.nextReady = false; });
  touch(room);
  emitRoom(room);
}

function startNextRound(room) {
  room.storytellerIndex = room.storytellerIndex === 0 ? 1 : 0;
  room.roundNumber += 1;
  room.phase = 'storyteller_select';
  room.current = newCurrent();
  room.players.forEach((p) => { p.nextReady = false; });
  touch(room);
  emitRoom(room);
}

function playerIndexBySocket(room, socketId) {
  return room.players.findIndex((p) => p.socketId === socketId);
}

function playerIndexByToken(room, playerToken) {
  return room.players.findIndex((p) => p.token === playerToken);
}

function roomForSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) || null : null;
}

function publicPlayer(player) {
  return {
    name: player.name,
    connected: player.connected,
    score: player.score,
    nextReady: player.nextReady
  };
}

function coopLabel(successes) {
  if (successes >= 9) return 'Sintonia incredibile';
  if (successes >= 7) return 'Grande sintonia';
  if (successes >= 5) return 'Buona sintonia';
  if (successes >= 3) return 'State imparando a leggervi';
  return 'Una sfida davvero tosta';
}

function viewFor(room, playerIndex) {
  const me = room.players[playerIndex];
  const isStoryteller = playerIndex === room.storytellerIndex;
  const base = {
    roomCode: room.code,
    mode: room.mode,
    status: room.status,
    phase: room.phase,
    roundNumber: room.roundNumber,
    storytellerIndex: room.storytellerIndex,
    myIndex: playerIndex,
    isStoryteller,
    players: room.players.map(publicPlayer),
    myHand: me.hand.map(cardData),
    coop: room.coop,
    duelTarget: 12,
    totalCards: CARDS.length
  };

  if (!room.current) return base;
  base.clue = room.current.clue;
  base.hasStorytellerChosen = Boolean(room.current.storytellerCard);
  base.hasResponderChosen = Boolean(room.current.responderCard);
  base.myVote = room.current.votes[playerIndex];
  base.otherHasVoted = room.current.votes[1 - playerIndex] !== null;
  base.duelAttempt = room.current.duelGuesses.length + 1;
  base.duelGuesses = [...room.current.duelGuesses];

  if (['duel_guess', 'voting', 'results'].includes(room.phase) || room.status === 'finished') {
    base.table = room.current.table.map(cardData);
  }
  if (room.phase === 'results' || room.status === 'finished') base.results = room.current.results;
  if (room.status === 'finished') base.gameOver = room.gameOver;
  return base;
}

function emitRoom(room) {
  room.players.forEach((player, index) => {
    if (player.socketId) io.to(player.socketId).emit('state', viewFor(room, index));
  });
}

function fail(ack, message) {
  if (typeof ack === 'function') ack({ ok: false, error: message });
}

function succeed(ack, extra = {}) {
  if (typeof ack === 'function') ack({ ok: true, ...extra });
}

function replenishHand(room, playerIndex) {
  const player = room.players[playerIndex];
  while (player.hand.length < 6) {
    const [next] = draw(room, 1);
    if (!next) break;
    player.hand.push(next);
  }
}

function finishDuelRound(room, outcome) {
  const storyteller = room.storytellerIndex;
  const responder = 1 - storyteller;
  const gained = [0, 0];

  if (outcome === 'first') gained[responder] = 2;
  if (outcome === 'second') {
    gained[responder] = 1;
    gained[storyteller] = 2;
  }

  room.players[0].score += gained[0];
  room.players[1].score += gained[1];

  room.current.results = {
    type: 'duel',
    clue: room.current.clue,
    storytellerCard: room.current.storytellerCard,
    guesses: [...room.current.duelGuesses],
    outcome,
    gained,
    afterScores: room.players.map((p) => p.score)
  };

  room.players[storyteller].hand = room.players[storyteller].hand.filter((id) => id !== room.current.storytellerCard);
  room.discard.push(room.current.storytellerCard);
  room.deck.push(...room.current.decoys);
  room.deck = shuffle(room.deck);
  replenishHand(room, storyteller);

  let finished = false;
  const [a, b] = room.players.map((p) => p.score);
  // Controlliamo la vittoria solo dopo una coppia completa di turni: così entrambi
  // hanno avuto lo stesso numero di turni da narratore e da indovinatore.
  if (room.roundNumber % 2 === 0 && (a >= 12 || b >= 12) && a !== b) {
    finished = true;
    const winnerIndex = a > b ? 0 : 1;
    room.gameOver = {
      type: 'duel',
      winnerIndex,
      message: `${room.players[winnerIndex].name} vince ${Math.max(a, b)} a ${Math.min(a, b)}!`
    };
  }

  room.status = finished ? 'finished' : 'playing';
  room.phase = 'results';
  room.players.forEach((p) => { p.nextReady = false; });
  touch(room);
  emitRoom(room);
}

function finishCoopRound(room) {
  const storyteller = room.storytellerIndex;
  const responder = 1 - storyteller;
  const storytellerVote = room.current.votes[storyteller];
  const responderVote = room.current.votes[responder];
  const storytellerCorrect = storytellerVote === room.current.responderCard;
  const responderCorrect = responderVote === room.current.storytellerCard;

  if (storytellerCorrect && responderCorrect) room.coop.successes += 1;
  else if (!storytellerCorrect && !responderCorrect) room.coop.errors += 1;
  else room.coop.partials += 1;

  room.current.results = {
    type: 'cooperative',
    clue: room.current.clue,
    storytellerCard: room.current.storytellerCard,
    responderCard: room.current.responderCard,
    storytellerVote,
    responderVote,
    storytellerCorrect,
    responderCorrect
  };

  const played = [room.current.storytellerCard, room.current.responderCard];
  for (let i = 0; i < 2; i += 1) {
    room.players[i].hand = room.players[i].hand.filter((id) => !played.includes(id));
  }
  room.discard.push(...played);
  room.deck.push(...room.current.decoys);
  room.deck = shuffle(room.deck);
  replenishHand(room, 0);
  replenishHand(room, 1);

  let finished = false;
  if (room.roundNumber >= 10) {
    finished = true;
    room.gameOver = {
      type: 'cooperative',
      label: coopLabel(room.coop.successes),
      message: `${room.coop.successes}/10 round perfetti · ${room.coop.partials} parziali · ${room.coop.errors} errori doppi`
    };
  }

  room.status = finished ? 'finished' : 'playing';
  room.phase = 'results';
  room.players.forEach((p) => { p.nextReady = false; });
  touch(room);
  emitRoom(room);
}

io.on('connection', (socket) => {
  socket.on('create-room', (payload = {}, ack) => {
    const { room, creatorToken } = makeRoom(payload.mode, payload.name, socket);
    socket.data.roomCode = room.code;
    socket.data.playerToken = creatorToken;
    socket.join(room.code);
    succeed(ack, { roomCode: room.code, playerToken: creatorToken });
    emitRoom(room);
  });

  socket.on('join-room', (payload = {}, ack) => {
    const code = String(payload.roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return fail(ack, 'Stanza non trovata. Controlla il codice.');
    if (room.players.length >= 2) return fail(ack, 'Questa stanza ha già due giocatori.');

    const playerToken = token();
    room.players.push({
      token: playerToken,
      socketId: socket.id,
      name: cleanName(payload.name),
      connected: true,
      hand: [],
      score: 0,
      nextReady: false
    });
    socket.data.roomCode = code;
    socket.data.playerToken = playerToken;
    socket.join(code);
    touch(room);
    succeed(ack, { roomCode: code, playerToken });
    startGame(room);
  });

  socket.on('resume-room', (payload = {}, ack) => {
    const code = String(payload.roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return fail(ack, 'La stanza non esiste più sul server.');
    const index = playerIndexByToken(room, payload.playerToken);
    if (index < 0) return fail(ack, 'Sessione non riconosciuta.');

    const player = room.players[index];
    player.socketId = socket.id;
    player.connected = true;
    socket.data.roomCode = code;
    socket.data.playerToken = player.token;
    socket.join(code);
    touch(room);
    succeed(ack, { roomCode: code, playerToken: player.token });
    emitRoom(room);
  });

  socket.on('leave-room', (_payload, ack) => {
    const room = roomForSocket(socket);
    if (!room) return succeed(ack);
    const index = playerIndexBySocket(room, socket.id);
    const leavingName = index >= 0 ? room.players[index].name : 'Un giocatore';

    room.players.forEach((player) => {
      if (player.socketId && player.socketId !== socket.id) {
        io.to(player.socketId).emit('room-closed', { message: `${leavingName} ha abbandonato la stanza.` });
      }
    });

    rooms.delete(room.code);
    socket.leave(room.code);
    socket.data.roomCode = null;
    socket.data.playerToken = null;
    succeed(ack);
  });

  socket.on('storyteller-submit', (payload = {}, ack) => {
    const room = roomForSocket(socket);
    if (!room || room.phase !== 'storyteller_select') return fail(ack, 'Non puoi fare questa azione adesso.');
    const index = playerIndexBySocket(room, socket.id);
    if (index !== room.storytellerIndex) return fail(ack, 'In questo turno non sei il narratore.');

    const cardId = Number(payload.cardId);
    const clue = String(payload.clue || '').trim().slice(0, 120);
    if (!room.players[index].hand.includes(cardId)) return fail(ack, 'Carta non valida.');
    if (!clue) return fail(ack, 'Scrivi un indizio prima di confermare.');

    room.current.storytellerCard = cardId;
    room.current.clue = clue;

    if (room.mode === 'duel') {
      room.current.decoys = draw(room, 5);
      if (room.current.decoys.length < 5) return fail(ack, 'Il mazzo non ha abbastanza carte disponibili.');
      room.current.table = shuffle([room.current.storytellerCard, ...room.current.decoys]);
      room.current.duelGuesses = [];
      room.phase = 'duel_guess';
    } else {
      room.phase = 'responder_select';
    }

    touch(room);
    succeed(ack);
    emitRoom(room);
  });

  socket.on('responder-submit', (payload = {}, ack) => {
    const room = roomForSocket(socket);
    if (!room || room.mode !== 'cooperative' || room.phase !== 'responder_select') return fail(ack, 'Non puoi fare questa azione adesso.');
    const index = playerIndexBySocket(room, socket.id);
    if (index === room.storytellerIndex) return fail(ack, 'Il narratore deve aspettare.');

    const cardId = Number(payload.cardId);
    if (!room.players[index].hand.includes(cardId)) return fail(ack, 'Carta non valida.');

    room.current.responderCard = cardId;
    room.current.decoys = draw(room, 4);
    if (room.current.decoys.length < 4) return fail(ack, 'Il mazzo non ha abbastanza carte disponibili.');
    room.current.table = shuffle([room.current.storytellerCard, room.current.responderCard, ...room.current.decoys]);
    room.current.votes = [null, null];
    room.phase = 'voting';
    touch(room);
    succeed(ack);
    emitRoom(room);
  });

  socket.on('duel-guess', (payload = {}, ack) => {
    const room = roomForSocket(socket);
    if (!room || room.mode !== 'duel' || room.phase !== 'duel_guess') return fail(ack, 'Non puoi indovinare adesso.');
    const index = playerIndexBySocket(room, socket.id);
    if (index < 0 || index === room.storytellerIndex) return fail(ack, 'Solo chi ascolta può indovinare.');

    const cardId = Number(payload.cardId);
    if (!room.current.table.includes(cardId)) return fail(ack, 'Carta non valida.');
    if (room.current.duelGuesses.includes(cardId)) return fail(ack, 'Hai già provato questa carta.');
    if (room.current.duelGuesses.length >= 2) return fail(ack, 'Hai già usato entrambi i tentativi.');

    room.current.duelGuesses.push(cardId);
    const correct = cardId === room.current.storytellerCard;
    succeed(ack, { correct, attempt: room.current.duelGuesses.length });

    if (correct) {
      finishDuelRound(room, room.current.duelGuesses.length === 1 ? 'first' : 'second');
    } else if (room.current.duelGuesses.length >= 2) {
      finishDuelRound(room, 'miss');
    } else {
      touch(room);
      emitRoom(room);
    }
  });

  socket.on('vote', (payload = {}, ack) => {
    const room = roomForSocket(socket);
    if (!room || room.mode !== 'cooperative' || room.phase !== 'voting') return fail(ack, 'La votazione non è attiva.');
    const index = playerIndexBySocket(room, socket.id);
    if (index < 0) return fail(ack, 'Giocatore non trovato.');

    const cardId = Number(payload.cardId);
    if (!room.current.table.includes(cardId)) return fail(ack, 'Carta non valida.');
    const ownPlayedCard = index === room.storytellerIndex ? room.current.storytellerCard : room.current.responderCard;
    if (cardId === ownPlayedCard) return fail(ack, 'Non puoi votare la carta che hai giocato tu.');
    if (room.current.votes[index] !== null) return fail(ack, 'Hai già votato.');

    room.current.votes[index] = cardId;
    touch(room);
    succeed(ack);
    if (room.current.votes.every((vote) => vote !== null)) finishCoopRound(room);
    else emitRoom(room);
  });

  socket.on('next-round-ready', (_payload, ack) => {
    const room = roomForSocket(socket);
    if (!room || room.phase !== 'results' || room.status === 'finished') return fail(ack, 'Il prossimo round non è disponibile.');
    const index = playerIndexBySocket(room, socket.id);
    if (index < 0) return fail(ack, 'Giocatore non trovato.');
    room.players[index].nextReady = true;
    touch(room);
    succeed(ack);
    if (room.players.every((p) => p.nextReady)) startNextRound(room);
    else emitRoom(room);
  });

  socket.on('restart-game', (_payload, ack) => {
    const room = roomForSocket(socket);
    if (!room || room.status !== 'finished') return fail(ack, 'La partita non è ancora finita.');
    if (room.players.length !== 2) return fail(ack, 'Servono due giocatori.');
    succeed(ack);
    startGame(room);
  });

  socket.on('disconnect', () => {
    const room = roomForSocket(socket);
    if (!room) return;
    const index = playerIndexBySocket(room, socket.id);
    if (index >= 0) {
      room.players[index].connected = false;
      room.players[index].socketId = null;
      touch(room);
      emitRoom(room);
    }
  });
});

setInterval(() => {
  const now = Date.now();
  const maxIdle = 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > maxIdle && room.players.every((p) => !p.connected)) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Dixit famiglia v2 in ascolto su http://${HOST}:${PORT} · ${CARDS.length} carte`);
});
