SPESE FAMIGLIA v48 — COMPATTA, CON LA TUA IMPOSTAZIONE

Questa versione parte dalla v47 allegata. Mantiene la disposizione originale:
entrate verdi, grafico delle categorie, uscite fisse azzurre, fabbisogno
arancione, totale uscite, risparmi e saldo. È pensata per il telefono.

COME AGGIORNARE IL TUO REPOSITORY GITHUB
1. Dalla tua app attuale, usa il pulsante del dischetto per esportare un backup.
2. Estrai lo ZIP. Carica nella stessa cartella del tuo repository questi file,
   sostituendo le versioni attuali:
   - index.html
   - sw.js
   - manifest.webmanifest
   - icon-192.png
   - icon-512.png
3. Mantieni il nome index.html e la stessa cartella/URL dell'app attuale.
   Se il repository usa già GitHub Pages, mantieni la sua configurazione.
4. Attendi l'aggiornamento del sito e riapri l'app. Se necessario chiudila
   completamente e riaprila. Il titolo della pagina indica v48.

I dati restano nello stesso archivio locale della v47. Non sono nel codice
né nel repository. Sullo stesso browser e URL vengono ritrovati; cambiando
browser, telefono o URL puoi recuperarli importando il backup JSON.
Lo ZIP non contiene dati personali o movimenti dimostrativi.

COSA È MIGLIORATO
- Vista compatta adattata all'altezza del telefono; entrate e colonne hanno
  scorrimento interno. I pulsanti Aggiungi e il riepilogo restano visibili.
- Uscite fisse e Fabbisogno mostrano ciascuna le prime due voci complete;
  scorri all'interno delle colonne per vedere le altre. L'altezza si adatta
  anche quando un nome occupa più righe, mantenendo le due colonne allineate.
- Dal dischetto puoi disattivare Vista compatta e tornare alle liste estese.
- 16 categorie: restano le 8 originali e si aggiungono Salute, Famiglia e
  scuola, Ristoranti e bar, Abbonamenti, Assicurazioni, Viaggi, Tasse, Animali.
- Il grafico mostra le prime 5 categorie e dà accesso a tutte le altre.
  Tocca una categoria per evidenziarla; tocca il centro per il dettaglio.
- Il pulsante Categorie apre ricerca, filtro e correzione della categoria
  per ogni voce. Puoi creare categorie personali e scegliere il loro colore.
- Ristoranti e supermercati, polizze e trasporti, tasse e commissioni sono
  distinti. Il riconoscimento usa regole locali e ricorda le correzioni per
  la stessa descrizione. Nessun servizio AI online.
- Le categorie confermate a mano e i nomi delle categorie importate sono
  conservati. La riclassificazione delle voci già archiviate avviene solo
  con Rianalizza automatiche, all'interno di Categorie.
- Corretto un problema della v47: una modifica Solo questo mese non cambia
  più la categoria della regola che governa gli altri mesi.
- Importazione JSON verificata prima della sostituzione. Copia separata
  precedente al ripristino, scaricabile dal pannello Backup.
- Stesse ricorrenze, entrate in attesa, saldo e import PDF Intesa della v47.
  La lettura PDF richiede internet per caricare la libreria, come prima.

NOTE D'USO
La correzione rapida da Categorie riguarda la voce del mese selezionato.
Per cambiare una ricorrenza, apri Modifica voce e ricorrenza e scegli Salva
da questo mese in poi. Le conferme manuali non vengono rianalizzate.
Il salvataggio locale non sincronizza dispositivi: conserva i backup JSON.
Le notifiche originali vengono controllate solo quando l'app è aperta.

VERIFICHE
Interfaccia provata con viewport mobile 390x844 e altre dimensioni.
Controllati import/export, nuove categorie e modifiche alle ricorrenze.
Le anteprime fornite nella chat usano dati inventati, non inclusi nell'app.

VERSIONE 51: importazione uscite in Fabbisogno salvo Sky, Apple e Agos; spostamento manuale bidirezionale delle spese importate tramite pulsante nella riga di dettaglio.
