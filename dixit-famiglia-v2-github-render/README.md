# Immaginario — 2 giocatori (v2)

Web game online per due giocatori con 106 carte illustrate personalizzate.

## Novità della v2

- 106 carte totali: le 68 precedenti + 38 nuove.
- Carte ottimizzate in 7 sprite sheet WebP: qualità alta, peso molto ridotto e pochissimi file da caricare su GitHub.
- Nuova modalità **Duello** 1 vs 1.
- Modalità **Cooperativa** mantenuta.
- Musica ambientale originale generata dal browser: nessun file audio pesante.
- Effetti sonori per selezione, indizio, distribuzione, errore, risultato e vittoria.
- Pulsanti separati per musica ed effetti sonori.
- Pulsante **Refresh** durante la partita. Dopo il refresh il gioco prova automaticamente a rientrare nella stessa stanza tramite la sessione salvata nel browser.
- Endpoint `/health` per Render.

## Modalità Duello

1. Il narratore sceglie una delle 6 carte della propria mano e scrive un indizio.
2. Il server aggiunge 5 carte-esca e mescola le 6 immagini.
3. L'altro giocatore ha due tentativi per trovare la carta del narratore.
4. Se indovina al primo tentativo, l'indovinatore prende 2 punti.
5. Se indovina al secondo tentativo, l'indovinatore prende 1 punto e il narratore prende 2 punti.
6. Se sbaglia entrambi i tentativi, nessuno prende punti. In questo modo al narratore non conviene creare un indizio impossibile.
7. I ruoli si alternano. La vittoria viene controllata solo dopo una coppia completa di turni, così entrambi hanno avuto lo stesso numero di turni nei due ruoli.
8. Vince chi raggiunge almeno 12 punti ed è in vantaggio.

## Modalità Cooperativa

1. Il narratore sceglie una carta e scrive un indizio.
2. L'altro giocatore sceglie dalla propria mano una carta che associa allo stesso indizio.
3. Il server aggiunge 4 carte-esca.
4. Entrambi votano: il narratore cerca la carta associata dall'altro, l'altro cerca la carta del narratore.
5. La partita dura 10 round e misura i round perfetti, parziali e gli errori doppi.

## Avvio locale

Richiede Node.js 20 o superiore.

```bash
npm install
npm start
```

Poi apri `http://localhost:3000`.

## Render

Configurazione consigliata:

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Se `package.json` è nella cartella principale del repository GitHub, lascia vuota la **Root Directory** su Render.

## Aggiornamento GitHub

Questa versione ha pochissimi file grafici: le 106 carte sono contenute in soli 7 file `public/cards/sheet_XX.webp`.

Per sostituire la versione precedente, il metodo più semplice è caricare nel repository i file di questa cartella mantenendo la stessa struttura. Se GitHub chiede se sostituire i file esistenti, conferma il commit delle modifiche. Render effettuerà poi il nuovo deploy dal repository collegato.
