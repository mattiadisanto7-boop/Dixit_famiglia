# Immaginario — gioco online per 2 giocatori

Web app multiplayer per due giocatori con 68 carte illustrate personalizzate, due modalità e stanze private con codice.

## Modalità

### Competitiva
- 6 carte in mano a testa.
- Il narratore sceglie una carta e scrive un indizio.
- L'altro giocatore sceglie dalla propria mano una carta che si adatti all'indizio.
- Il server aggiunge 4 carte-esca e mostra 6 carte mischiate.
- L'associatore cerca la carta del narratore; il narratore cerca la carta dell'associatore.
- Risposta corretta: +2 al giocatore che indovina.
- Risposta sbagliata: +1 all'avversario che è riuscito a confonderlo.
- Vince chi raggiunge almeno 20 punti con un punteggio diverso dall'altro giocatore. In caso di parità sopra 20 si continua.

### Cooperativa
- Stesso flusso di gioco.
- 10 round totali, con narratore alternato.
- Entrambi corretti: 1 round perfetto.
- Uno corretto: intesa parziale.
- Entrambi sbagliati: doppio errore.

## Avvio sul PC

Serve Node.js 20 o superiore.

```bash
npm install
npm start
```

Poi apri `http://localhost:3000`.

Per provare in due sullo stesso PC, apri una finestra normale e una finestra in incognito.

## Pubblicazione GitHub + Render

1. Crea un repository vuoto su GitHub, ad esempio `dixit-2-giocatori`.
2. Carica **tutto il contenuto di questa cartella** nel repository (non la cartella `node_modules`).
3. Su Render scegli **New > Web Service** e collega GitHub.
4. Seleziona il repository.
5. Imposta:
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
6. Avvia il deploy.

È incluso anche `render.yaml`, quindi il progetto è pronto per essere usato come Render Blueprint.

## Note tecniche

- Server: Node.js + Express + Socket.IO.
- Stato delle partite: in memoria sul server.
- Se il browser viene aggiornato, la sessione viene ripresa tramite un token salvato in `localStorage` finché la stessa istanza server conserva la stanza.
- Se Render riavvia o ridistribuisce il servizio, le partite attive in memoria vengono perse. Per una versione successiva si può aggiungere persistenza con Redis/Render Key Value.
- Le immagini delle carte sono in `public/cards/` e il manifest è `public/cards.json`.


## Versione leggera
Le carte sono ottimizzate in WebP per ridurre il peso del repository e velocizzare il caricamento online.
