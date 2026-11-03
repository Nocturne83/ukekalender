# Ukeplanen

En enkel app for to personer som planlegger uka sammen: avtaler, middag, bil og barnehage. Avtalene bekreftes av begge, og bekreftede avtaler havner i en delt Google-kalender eller i Google Tasks.

- **Appen** (denne mappen) ligger på GitHub Pages og kan installeres på hjemskjermen (Android og iPhone).
- **Backenden** (`backend/`) er et Google Apps Script som lagrer data i et Google-ark, synkroniserer med kalender/Tasks og sender push-varsler via Firebase Cloud Messaging.

Ingen navn, e-poster eller andre personopplysninger ligger i koden. De legges inn som *Script Properties* i hver enkelt sin kopi av skriptet.

## Funksjoner
- Planlegg uka dag for dag, opptil 13 uker frem
- Avtaler med tid eller hele dagen, sted (adresse eller Google Maps-lenke, med kart og veibeskrivelse) og hvem som tar det
- Begge bekrefter nye avtaler; endringer etter bekreftelse krever en kommentar og varsler den andre
- Angre et «ja», avlyse med begrunnelse
- Fast oppsett per dag: middag, bil, levering og henting i barnehagen
- Push-varsler, påminnelser (søndager eller daglig), lys og mørk modus

## Oppsett
### 1. Backend (Google Apps Script)
1. Lag et nytt prosjekt på script.google.com.
2. Lim inn `backend/Code.gs`. Slå på visning av `appsscript.json` under *Project Settings* og lim inn `backend/appsscript.json`.
3. Under *Project Settings → Script Properties*, legg til:
   | Nøkkel | Verdi |
   |---|---|
   | `NAME_P1` | Navnet ditt (eieren av skriptet) |
   | `NAME_P2` | Navnet til den andre |
   | `EMAIL_P2` | E-postadressen til den andre |
   | `APP_URL` | Adressen til appen, f.eks. `https://<bruker>.github.io/<repo>/` |
4. Kjør `setup` og godkjenn tilgangene.
5. *Deploy → New deployment → Web app*, «Execute as: Me», «Who has access: Anyone».
6. Kjør `showLinks` for å få de to personlige lenkene.

### 2. Push-varsler (valgfritt, Firebase)
1. Opprett et prosjekt på console.firebase.google.com og legg til en **Web**-app.
2. Kopier `firebaseConfig` til Script Property `FIREBASE_CONFIG`.
3. *Project settings → Cloud Messaging → Web Push certificates → Generate key pair*. Kopier nøkkelen til `FIREBASE_VAPID`.
4. *Project settings → Service accounts → Generate new private key*. Lim inn hele JSON-filen i `FCM_SERVICE_ACCOUNT`.
5. Kjør `checkSettings`, og deretter `testPush` når en telefon har slått på varsler.

Uten Firebase sendes viktige beskjeder på e-post i stedet.

### 3. Appen
Åpne den personlige lenken på telefonen og legg appen til på hjemskjermen. Trykk på bjella og velg «Slå på varsler».

Vil du se appen med testdata: åpne `…/#demo`.

## Personvern
Lenkene inneholder en personlig nøkkel. Del dem bare med den de er til. Kjør `newLinks` for å lage nye hvis en lenke kommer på avveie.
