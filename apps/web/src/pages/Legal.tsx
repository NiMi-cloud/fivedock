import { HOSTING, OPERATOR, hasAddress, missingLegalFields, variableName } from '../legal.config.ts';

function Missing() {
  const missing = missingLegalFields();
  if (missing.length === 0) return null;
  return (
    <p className="notice notice-warn" role="alert">
      <strong>Noch nicht ausgefüllt:</strong> {missing.map(variableName).join(', ')}. Die Angaben werden beim Bauen aus diesen
      Umgebungsvariablen gelesen (siehe <code>apps/web/src/legal.config.ts</code>). Ohne sie darf die Seite nicht veröffentlicht werden.
    </p>
  );
}

export function Impressum() {
  return (
    <main className="container prose">
      <h1>Impressum</h1>
      <Missing />
      <h2>Angaben nach § 5 DDG</h2>
      <p>
        {OPERATOR.name || '[Name]'}
        {hasAddress() ? (
          <>
            <br />
            {OPERATOR.street}
            <br />
            {OPERATOR.city}
            <br />
            {OPERATOR.country}
          </>
        ) : null}
      </p>
      {hasAddress() ? null : (
        <p>
          Dies ist ein privates, nicht kommerzielles Angebot ohne Werbung und ohne Einnahmen. Kontakt bitte per E-Mail.
        </p>
      )}
      <h2>Kontakt</h2>
      <p>
        E-Mail: {OPERATOR.email || '[E-Mail-Adresse]'}
        {OPERATOR.phone ? (
          <>
            <br />
            Telefon: {OPERATOR.phone}
          </>
        ) : null}
      </p>
      <h2>Haftung für Inhalte</h2>
      <p>
        Die Inhalte dieser Seite wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität
        kann jedoch keine Gewähr übernommen werden. Die erzeugten Dateien werden ohne Mängelgewähr bereitgestellt;
        es kann nicht garantiert werden, dass jedes Ergebnis in jedem Server-Setup fehlerfrei funktioniert.
      </p>
      <h2>Marken</h2>
      <p>
        GTA, Grand Theft Auto, FiveM und alle weiteren genannten Marken gehören ihren jeweiligen Inhabern. Dieses
        Projekt ist unabhängig und nicht mit Rockstar Games, Take-Two Interactive oder Cfx.re verbunden.
      </p>
    </main>
  );
}

export function Datenschutz() {
  return (
    <main className="container prose">
      <h1>Datenschutzerklärung</h1>
      <Missing />
      <p className="muted">Entwurf. Bitte vor der Veröffentlichung prüfen und gegebenenfalls rechtlich beraten lassen.</p>

      <h2>1. Verantwortlicher</h2>
      <p>
        {[OPERATOR.name || '[Name]', ...(hasAddress() ? [OPERATOR.street, OPERATOR.city, OPERATOR.country] : [])].join(', ')}.
        E-Mail: {OPERATOR.email || '[E-Mail-Adresse]'}
      </p>

      <h2>2. Deine Dateien bleiben auf deinem Gerät</h2>
      <p>
        Die Umwandlung deiner 3D-Modelle, Bilder und Texturen findet vollständig in deinem Browser statt. Die Dateien
        werden nicht an uns oder an Dritte übertragen und nicht gespeichert. Es gibt keinen Upload-Server und kein
        Benutzerkonto.
      </p>

      <h2>3. Hosting und Server-Logdaten</h2>
      <p>
        Die Seite wird bei {HOSTING.name} ({HOSTING.address}) gehostet. Beim Aufruf verarbeitet der Hosting-Anbieter
        technisch notwendige Daten wie deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Seite und Angaben zu
        deinem Browser, um die Seite auszuliefern und abzusichern. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
        (berechtigtes Interesse an einer sicheren und stabilen Bereitstellung). Mit dem Anbieter besteht ein Vertrag
        zur Auftragsverarbeitung; bei einer Übermittlung in die USA stützt sich diese auf die Standardvertragsklauseln
        beziehungsweise das EU-US Data Privacy Framework.
      </p>

      <h2>4. Lokaler Speicher im Browser</h2>
      <p>
        Die Seite speichert in deinem Browser (Local Storage) nur deine Einstellungen für Sprache und Farbschema. Diese
        Werte verlassen dein Gerät nicht und enthalten keine personenbezogenen Daten. Es werden keine Cookies zu
        Werbe- oder Analysezwecken gesetzt, und es gibt kein Tracking.
      </p>

      <h2>5. Keine Drittanbieter-Dienste</h2>
      <p>
        Es werden keine externen Schriftarten, Analyse-Tools, Werbenetzwerke oder Social-Media-Plugins eingebunden.
        Alle Skripte werden von dieser Seite selbst ausgeliefert.
      </p>

      <h2>6. Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit
        und Widerspruch sowie das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Wende dich dafür an
        die oben genannte E-Mail-Adresse.
      </p>
    </main>
  );
}
