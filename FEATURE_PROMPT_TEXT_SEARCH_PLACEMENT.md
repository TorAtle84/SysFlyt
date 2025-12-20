# Feature Request: Tekstsøk-basert Komponent-plassering i PDF

## Oversikt
Implementer en avansert tekstsøk-funksjon for å lokalisere og plassere komponenter nøyaktig i PDF-dokumenter (systemskjema). Funksjonen skal bruke eksisterende PDF-tekstekstraksjon og masseliste for å finne den eksakte plasseringen (X, Y-koordinater) til hver komponent i dokumentet.

---

## Eksisterende Infrastruktur

### 1. PDF Tekstekstraksjon
**Fil**: `src/lib/pdf-text-extractor.ts`

Eksisterende funksjonalitet:
- `extractTextFromPDF(buffer)` - Ekstraherer tekst med koordinater fra PDF
- `findComponentsInText(items, defaultSystem)` - Finner komponenter i tekstdata
- `TextItem` interface - Inneholder `text`, `x`, `y`, `width`, `height`, `page`
- `ExtractedComponent` interface - Inneholder `code`, `system`, `x`, `y`, `width`, `height`, `page`, `confidence`

Nåværende logikk:
- Grupperer tekst-items per side
- Sorterer etter Y (øverst til nederst), deretter X (venstre til høyre)
- Clustrer items til linjer (Y-toleranse: 3%)
- Parser komponenter med `parseComponentIds()` fra `id-pattern.ts`
- Mapper parsede komponenter tilbake til koordinater ved string matching

### 2. Masseliste
**Fil**: `src/app/api/projects/[projectId]/mass-list/route.ts`

Eksisterende funksjonalitet:
- `GET /api/projects/[projectId]/mass-list` - Henter masseliste
- `POST /api/projects/[projectId]/mass-list` - Laster opp Excel med TFM-koder
- Databasemodell: `MassList` med felter:
  - `tfm` (full TFM-kode)
  - `building` (byggnummer)
  - `system` (systemkode, f.eks. "360.0001")
  - `component` (komponentkode, f.eks. "RTA4001")
  - `typeCode` (typekode)
  - `productName`, `location`, `zone`

### 3. TFM Parsing
**Fil**: `src/lib/tfm-id.ts`

Eksisterende funksjonalitet:
- `parseTFM(tfm)` - Parser TFM-kode til komponenter
- `compareTFM(tfm1, tfm2)` - Sammenligner to TFM-koder (normalisert)
- `normalizeComponentCode(code)` - Normaliserer komponentkode
- `normalizeSystemCode(code)` - Normaliserer systemkode

TFM-format (per `tfmrules.md`):
```
+{byggnr}={system}-{komponent}%{typekode}
Eksempel: +256=360.0001-RTA4001%RTA0001
```

Komponenter:
- **Byggnr** (valgfri): `+` etterfulgt av tall/bokstaver
- **System** (påkrevd): 3-4 siffer `.` 3-4 siffer, valgfri `:versjon`
- **Komponent** (påkrevd): 2-3 bokstaver etterfulgt av minst ett siffer
- **Typekode** (valgfri): `%` etterfulgt av 2-3 bokstaver

---

## Funksjonskrav

### Primær Funksjon: Tekstsøk-basert Plassering

#### Input
1. **PDF-dokument** (systemskjema)
2. **Masseliste** med komponenter fra prosjektet
3. **Valgfri**: Spesifikk komponentkode å søke etter

#### Prosess
1. **Ekstraher all tekst fra PDF** med koordinater
   - Bruk `extractTextFromPDF()` for å få alle `TextItem[]`
   - Hver TextItem inneholder: tekst, x, y, bredde, høyde, sidenummer

2. **For hver komponent i masselisten**:

   a. **Bygg søkevarianter**:
   - Full TFM-kode: `+256=360.0001-RTA4001%RTA0001`
   - Uten byggnr: `360.0001-RTA4001`
   - Uten typekode: `360.0001-RTA4001`
   - Kun system+komponent: `360.0001 RTA4001`
   - Kun komponent: `RTA4001`

   b. **Søk gjennom tekstdata**:
   - Iterer gjennom alle `TextItem[]`
   - For hver variant, søk case-insensitive
   - Hvis match funnet, registrer:
     - X, Y koordinater (midtpunkt av tekstboks)
     - Sidenummer
     - Match-type (full TFM, delvis, kun komponent)
     - Confidence score (høyere for mer spesifikke matches)

   c. **Håndter multiple matches**:
   - Hvis samme komponent finnes flere ganger på samme side:
     - Prioriter mest spesifikke match (full TFM > delvis > kun komponent)
     - Hvis samme spesifisitet, ta første forekomst (top-left)
     - Logg warning om multiple matches

   d. **Håndter ingen matches**:
   - Returner komponent med `x: null, y: null, confidence: 0`
   - Flagg som "ikke funnet"

3. **Returner resultat**:
   - Array av komponenter med koordinater
   - Statistikk: totalt, funnet, ikke funnet
   - Liste over komponenter med multiple matches

#### Output Format
```typescript
interface ComponentPlacement {
  // Fra masseliste
  massListId: string;
  tfm: string;
  system: string;
  component: string;
  typeCode?: string;
  productName?: string;

  // Fra tekstsøk
  found: boolean;
  x: number | null;
  y: number | null;
  page: number | null;
  width: number;
  height: number;
  matchType: 'full-tfm' | 'system-component' | 'component-only' | 'not-found';
  confidence: number; // 0.0 - 1.0
  matchedText?: string; // Faktisk tekst som ble matchet
  multipleMatches?: boolean;
  matchCount?: number;
}

interface PlacementResult {
  documentId: string;
  totalComponents: number;
  foundComponents: number;
  notFoundComponents: number;
  multipleMatchComponents: number;
  placements: ComponentPlacement[];
}
```

---

## API Endepunkt

### Nytt Endepunkt
**POST** `/api/projects/{projectId}/documents/{documentId}/place-components`

**Request Body**:
```json
{
  "componentCode": "RTA4001" // Valgfri: søk kun etter spesifikk komponent
}
```

**Response**:
```json
{
  "documentId": "abc123",
  "totalComponents": 150,
  "foundComponents": 142,
  "notFoundComponents": 8,
  "multipleMatchComponents": 5,
  "placements": [
    {
      "massListId": "xyz789",
      "tfm": "+256=360.0001-RTA4001",
      "system": "360.0001",
      "component": "RTA4001",
      "found": true,
      "x": 245.5,
      "y": 380.2,
      "page": 1,
      "width": 50,
      "height": 12,
      "matchType": "full-tfm",
      "confidence": 0.95,
      "matchedText": "+256=360.0001-RTA4001",
      "multipleMatches": false
    },
    {
      "massListId": "xyz790",
      "tfm": "360.0002-KA001",
      "system": "360.0002",
      "component": "KA001",
      "found": false,
      "x": null,
      "y": null,
      "page": null,
      "matchType": "not-found",
      "confidence": 0
    }
  ]
}
```

---

## UI Integration

### 1. Ny Knapp på Systemskjema-siden
**Plassering**: Ved siden av "Verifiser mot masseliste"-knappen

**Tekst**: "🔍 Finn komponenter i PDF"

**Funksjonalitet**:
- Kjører tekstsøk-funksjonen
- Viser progress indicator
- Åpner dialog med resultater

### 2. Resultat-dialog
**Innhold**:
- **Statistikk-panel** (øverst):
  - Totalt komponenter: 150
  - Funnet: 142 (94.7%)
  - Ikke funnet: 8 (5.3%)
  - Multiple matches: 5 (3.3%)

- **Tabell** med funne komponenter:
  | Komponent | System | TFM | Side | Match Type | Confidence | Handlinger |
  |-----------|--------|-----|------|------------|------------|------------|
  | RTA4001 | 360.0001 | +256=... | 1 | Full TFM | 95% | 👁️ Vis |
  | KA001 | 360.0002 | 360... | 2 | Kun komp. | 60% | 👁️ Vis |

- **Filtreringsalternativer**:
  - Vis kun ikke-funnet
  - Vis kun multiple matches
  - Vis kun lav confidence (<70%)
  - Søk etter komponent/system

- **Handlinger**:
  - "Vis i PDF" - Navigerer til PDF og zoomer til komponenten
  - "Eksporter CSV" - Last ned resultatene
  - "Marker alle" - Marker alle funne komponenter i PDF

### 3. PDF Viewer Integration
**Når bruker klikker "Vis i PDF"**:
- Åpne PDF-viewer med dokumentet
- Naviger til riktig side
- Zoom til området rundt komponenten (X, Y ± 100px)
- Highlight området med gul boks
- Vis tooltip med komponentinformasjon

---

## Tekniske Detaljer

### Matching Algoritme

```typescript
function findComponentInText(
  component: MassListItem,
  textItems: TextItem[]
): ComponentPlacement {

  // 1. Bygg søkevarianter (høyest til lavest prioritet)
  const searchVariants = [
    { pattern: buildFullTFM(component), type: 'full-tfm', confidence: 0.95 },
    { pattern: `${component.system}-${component.component}`, type: 'system-component', confidence: 0.85 },
    { pattern: `${component.system} ${component.component}`, type: 'system-component', confidence: 0.80 },
    { pattern: component.component, type: 'component-only', confidence: 0.60 },
  ];

  // 2. Søk gjennom tekstdata
  const matches: Array<{ item: TextItem; variant: any }> = [];

  for (const variant of searchVariants) {
    for (const item of textItems) {
      if (item.text.toUpperCase().includes(variant.pattern.toUpperCase())) {
        matches.push({ item, variant });
      }
    }

    // Stopp ved første match på høyeste prioritetsnivå
    if (matches.length > 0) break;
  }

  // 3. Håndter resultat
  if (matches.length === 0) {
    return { ...component, found: false, matchType: 'not-found', confidence: 0 };
  }

  // Velg beste match (første på samme side hvis multiple)
  const bestMatch = matches[0];

  return {
    ...component,
    found: true,
    x: bestMatch.item.x + bestMatch.item.width / 2,
    y: bestMatch.item.y + bestMatch.item.height / 2,
    page: bestMatch.item.page,
    width: bestMatch.item.width,
    height: bestMatch.item.height,
    matchType: bestMatch.variant.type,
    confidence: bestMatch.variant.confidence,
    matchedText: bestMatch.item.text,
    multipleMatches: matches.length > 1,
    matchCount: matches.length,
  };
}
```

### Performance Optimering
- **Caching**: Cache tekstekstraksjon per dokument
- **Batching**: Prosesser komponenter i batches av 50
- **Progress Updates**: Send progress events via Server-Sent Events eller WebSocket
- **Parallel Processing**: Bruk worker threads for store dokumenter

---

## Edge Cases & Feilhåndtering

### 1. Komponent finnes ikke i PDF
- Returner `found: false` med `confidence: 0`
- Logg i debug-log hvilke varianter som ble prøvd

### 2. Multiple Matches
- Prioriter etter:
  1. Match-type (full TFM > system+komponent > kun komponent)
  2. Side-nummer (laveste side først)
  3. Y-koordinat (øverst først)
  4. X-koordinat (venstre først)
- Flagg resultatet som `multipleMatches: true`

### 3. Delvis Match
- Eksempel: Søker etter "RTA4001", finner "RTA40015"
- Bruk word boundaries når mulig
- Reduser confidence score for fuzzy matches

### 4. Roterte eller Skannede PDF-er
- PDF-er uten tekstlag (kun bilder):
  - Returner feilmelding: "Dokumentet har ikke tekstlag. OCR er ikke støttet ennå."
- Roterte sider:
  - Koordinater vil være feil - legg til warning i resultat

### 5. Store Dokumenter
- Timeout etter 60 sekunder
- Returner partial results med error message
- Gi bruker mulighet til å fortsette eller avbryte

---

## Testing

### Unit Tests
1. **Matching Algoritme**
   - Test alle søkevarianter
   - Test case-insensitivity
   - Test normalisering av koder
   - Test multiple matches håndtering

2. **TFM Parsing**
   - Test alle TFM-format varianter fra tfmrules.md
   - Test edge cases (manglende byggnr, typeCode, etc.)

3. **Koordinat Mapping**
   - Test at X,Y koordinater mappes korrekt
   - Test side-nummer mapping
   - Test håndtering av tomme dokumenter

### Integration Tests
1. Last opp test-PDF med kjente komponenter
2. Last opp masseliste med samme komponenter
3. Kjør tekstsøk-funksjon
4. Verifiser at alle komponenter finnes med riktige koordinater

### E2E Tests
1. Full user flow fra opplasting til visning i PDF
2. Test eksport av resultater
3. Test filtrering og søk i resultat-dialog

---

## Suksesskriterier

### Funksjonelle Krav
✅ Finne minst 90% av komponenter i typisk systemskjema
✅ Returnere resultater innen 10 sekunder for dokument med 100 komponenter
✅ Håndtere dokumenter med opp til 1000 komponenter
✅ Korrekte X,Y koordinater med +/- 5px nøyaktighet
✅ Brukervennlig UI med tydelig feedback

### Tekniske Krav
✅ Kode følger eksisterende arkitektur og mønstre
✅ Komplett TypeScript typing
✅ 80%+ test coverage
✅ Ingen regressions i eksisterende funksjonalitet
✅ God ytelse (ingen UI freezing)

---

## Fremtidige Forbedringer

### Fase 2
- **OCR Support**: Bruk Tesseract.js for skannede PDF-er
- **Fuzzy Matching**: Levenshtein distance for typos
- **Bulk Operations**: Marker flere komponenter samtidig
- **Auto-tagging**: Automatisk tag dokumenter basert på funne komponenter

### Fase 3
- **Machine Learning**: Tren modell på historiske plasseringer
- **Visual Search**: Bildegjenkjenning for komponenter uten tekst
- **Smart Suggestions**: Foreslå sannsynlige plasseringer for ikke-funnet komponenter

---

## Implementasjonsrekkefølge

1. ✅ **Backend API** (`place-components` endepunkt)
2. ✅ **Core Logic** (tekstsøk og matching algoritme)
3. ✅ **Database Integration** (lagre resultater for caching)
4. ✅ **Frontend UI** (knapp + resultat-dialog)
5. ✅ **PDF Viewer Integration** (navigering og highlighting)
6. ✅ **Testing** (unit, integration, E2E)
7. ✅ **Documentation** (brukerveiledning + API docs)

---

## Referanser

**Eksisterende Filer**:
- `src/lib/pdf-text-extractor.ts` - PDF tekstekstraksjon
- `src/lib/id-pattern.ts` - Komponent pattern matching
- `src/lib/tfm-id.ts` - TFM parsing og normalisering
- `src/lib/scan.ts` - Dokument scanning infrastruktur
- `tfmrules.md` - TFM format spesifikasjon

**UI Komponenter**:
- `src/components/pages/project/document-workspace.tsx` - Systemskjema workspace
- `src/components/pdf-viewer/pdf-viewer-wrapper.tsx` - PDF viewer

**API Ruter**:
- `src/app/api/projects/[projectId]/documents/[documentId]/verify/route.ts` - Verifisering API (mal)
- `src/app/api/projects/[projectId]/mass-list/route.ts` - Masseliste API
