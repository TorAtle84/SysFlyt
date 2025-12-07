# Feature: Tekstsøk-verifisering av Komponent-koordinater

## Problem
Når vi scanner PDF-dokumenter for komponenter, får vi noen ganger upresise koordinater fordi:
- Komponenten kan være spredt over flere tekst-items
- Systemkode og komponent kan stå på forskjellige linjer
- Regex-matching fanger opp delvis tekst

## Løsning
Legg til en ekstra verifikasjonssteg som søker etter den eksakte komponent-koden i PDF-tekstdata for å finne de riktige koordinatene.

---

## Implementasjon

### Sted i Kodebasen
**Fil**: `src/lib/pdf-text-extractor.ts`
**Funksjon**: `findComponentsInText()`

### Eksisterende Flyt
```typescript
// Nåværende logikk (forenklet)
export function findComponentsInText(items: TextItem[], defaultSystem?: string) {
  // 1. Parser komponenter fra sammenslått tekst
  const parsedComponents = parseComponentIds(fullText, defaultSystem);

  // 2. Finn koordinater ved å søke i linjer
  for (const parsed of parsedComponents) {
    if (lineText.includes(parsed.code)) {
      // Bruker koordinater fra første match
      foundItem = item;
    }
  }
}
```

### Problem med Nåværende Tilnærming
- Hvis `parsed.code = "RTA4001"` finnes i teksten `"360.0001-RTA4001"`,
  får vi koordinatene fra hele strengen, ikke bare komponenten
- Hvis komponenten står alene på en linje, men systemkoden står over,
  får vi feil Y-koordinat

---

## Ny Funksjon: `verifyComponentCoordinates()`

### Input
```typescript
interface ComponentToVerify {
  code: string;           // "RTA4001"
  system?: string;        // "360.0001"
  x: number;              // Estimert X fra parsing
  y: number;              // Estimert Y fra parsing
  page: number;
}
```

### Prosess
1. **Bygg søkevarianter** (i prioritert rekkefølge):
   ```typescript
   const searchVariants = [
     `${system}-${code}`,     // "360.0001-RTA4001" (høyest prioritet)
     `${system} ${code}`,     // "360.0001 RTA4001"
     code,                    // "RTA4001" (kun komponent)
   ];
   ```

2. **Søk i tekstdata nær estimert posisjon**:
   ```typescript
   // Filtrer tekstItems til samme side og nærområde
   const nearbyItems = textItems.filter(item =>
     item.page === page &&
     Math.abs(item.y - y) < 50 &&  // Innen 50px vertikalt
     Math.abs(item.x - x) < 200     // Innen 200px horisontalt
   );
   ```

3. **Match mot hver variant**:
   - For hver søkevariant, søk gjennom nearby items
   - Første eksakte match vinner
   - Hvis ingen eksakte matches, bruk mest liknende (Levenshtein distance < 3)

4. **Returner verifiserte koordinater**:
   ```typescript
   return {
     ...component,
     x: verifiedItem.x + verifiedItem.width / 2,  // Midtpunkt
     y: verifiedItem.y + verifiedItem.height / 2,
     width: verifiedItem.width,
     height: verifiedItem.height,
     verifiedByText: true,
     matchedText: verifiedItem.text,
   };
   ```

---

## Komplett Kodeeksempel

```typescript
/**
 * Verifiser og forbedre komponentkoordinater ved direkte tekstsøk
 */
function verifyComponentCoordinates(
  component: ExtractedComponent,
  allTextItems: TextItem[]
): ExtractedComponent {

  // 1. Bygg søkevarianter (høyest til lavest prioritet)
  const searchVariants: string[] = [];

  if (component.system && component.code) {
    searchVariants.push(`${component.system}-${component.code}`);
    searchVariants.push(`${component.system} ${component.code}`);
  }
  searchVariants.push(component.code);

  // 2. Filtrer til nærområde (samme side, innen 50px vertikalt, 200px horisontalt)
  const searchRadius = { x: 200, y: 50 };
  const nearbyItems = allTextItems.filter(item =>
    item.page === component.page &&
    Math.abs(item.y - component.y) <= searchRadius.y &&
    Math.abs(item.x - component.x) <= searchRadius.x
  );

  // 3. Søk etter beste match
  for (const variant of searchVariants) {
    for (const item of nearbyItems) {
      const normalizedItemText = item.text.trim().toUpperCase();
      const normalizedVariant = variant.trim().toUpperCase();

      // Eksakt match
      if (normalizedItemText.includes(normalizedVariant)) {
        return {
          ...component,
          x: item.x + item.width / 2,   // Midtpunkt av tekstboks
          y: item.y + item.height / 2,
          width: item.width,
          height: item.height,
          verifiedByText: true,
          matchedText: item.text,
          confidence: 0.95,  // Høy confidence ved eksakt match
        };
      }
    }
  }

  // 4. Hvis ingen eksakt match, søk i hele siden (fallback)
  const pageItems = allTextItems.filter(item => item.page === component.page);

  for (const variant of searchVariants) {
    for (const item of pageItems) {
      if (item.text.trim().toUpperCase().includes(variant.trim().toUpperCase())) {
        return {
          ...component,
          x: item.x + item.width / 2,
          y: item.y + item.height / 2,
          width: item.width,
          height: item.height,
          verifiedByText: true,
          matchedText: item.text,
          confidence: 0.75,  // Lavere confidence hvis funnet utenfor område
        };
      }
    }
  }

  // 5. Ingen bedre koordinater funnet, returner original
  return {
    ...component,
    verifiedByText: false,
    confidence: 0.5,  // Lav confidence
  };
}
```

---

## Integrasjon i Eksisterende Kode

### Oppdater `findComponentsInText()`

**Før**:
```typescript
export function findComponentsInText(items: TextItem[], defaultSystem?: string) {
  // ... parsing logic ...

  for (const parsed of parsedComponents) {
    // ... finn koordinater ...
    components.push({
      code: parsed.code,
      system: parsed.system,
      x: foundItem.x,
      y: foundItem.y,
      // ...
    });
  }

  return components;
}
```

**Etter**:
```typescript
export function findComponentsInText(items: TextItem[], defaultSystem?: string) {
  // ... parsing logic (uendret) ...

  const rawComponents = []; // Samle først alle komponenter

  for (const parsed of parsedComponents) {
    // ... finn estimerte koordinater ...
    rawComponents.push({
      code: parsed.code,
      system: parsed.system,
      x: foundItem.x,
      y: foundItem.y,
      page: pageNum,
      // ...
    });
  }

  // ✨ NYT: Verifiser alle koordinater med tekstsøk
  const verifiedComponents = rawComponents.map(comp =>
    verifyComponentCoordinates(comp, items)
  );

  return verifiedComponents;
}
```

---

## Fordeler med denne Tilnærmingen

✅ **Forbedret nøyaktighet**: Finner eksakte koordinater for komponenten, ikke omliggende tekst
✅ **Minimal endring**: Kun én ny hjelpefunksjon, integreres enkelt
✅ **Fallback**: Beholder original koordinat hvis verifikasjon feiler
✅ **Confidence tracking**: Vet hvor pålitelige koordinatene er
✅ **Debug-vennlig**: `matchedText` og `verifiedByText` felter for troubleshooting

---

## Testing

### Test Cases
1. **Komponent alene på linje**
   ```
   Tekst i PDF:    "RTA4001"
   Forventet:      Koordinater fra "RTA4001" item
   ```

2. **Full TFM på en linje**
   ```
   Tekst i PDF:    "360.0001-RTA4001"
   Forventet:      Koordinater fra hele strengen (midtpunkt)
   ```

3. **System og komponent på separate linjer**
   ```
   Tekst i PDF:    Linje 1: "360.0001"
                   Linje 2: "RTA4001"
   Forventet:      Koordinater fra "RTA4001" linje
   ```

4. **Komponent ikke i nærområde**
   ```
   Estimert Y: 100
   Faktisk Y:  200
   Forventet:  Fallback-søk finner riktig koordinat
   ```

### Verifisering
```typescript
// Før og etter sammenligning
const before = findComponentsInText(items); // Original
const after = findComponentsInText(items);  // Med verifikasjon

console.log('Forbedret koordinater:',
  after.filter(c => c.verifiedByText).length
);
```

---

## Edge Cases

### 1. Multiple komponenter med samme kode på samme side
**Løsning**: Ta første match innenfor søkeområde (nærmest estimert posisjon)

### 2. Komponent spredt over flere text items
**Eksempel**: `"360.0001-"` og `"RTA4001"` som separate items
**Løsning**: Søkevarianter fanger både full TFM og kun komponent

### 3. Ingen match innenfor søkeradius
**Løsning**: Utvid søk til hele siden (fallback)

### 4. Spesialtegn i komponentkode
**Eksempel**: `"AA01T/003"`
**Løsning**: Normalisering beholder `/`, `-`, `_` tegn

---

## Performance

### Optimering
- **Spatial filtering**: Begrenser søk til nærområde først
- **Early exit**: Returnerer ved første eksakte match
- **Caching**: Samme `textItems` array gjenbrukes for alle komponenter

### Estimert overhead
- **Per komponent**: ~0.1ms ekstra (trivielt tekstsøk)
- **For 100 komponenter**: ~10ms totalt
- **Neglisjerbar**: siden PDF-parsing er mye tregere (flere sekunder)

---

## Implementasjonssjekkliste

- [ ] Legg til `verifyComponentCoordinates()` funksjon i `pdf-text-extractor.ts`
- [ ] Oppdater `ExtractedComponent` interface med `verifiedByText?: boolean`
- [ ] Integrer i `findComponentsInText()` (ett `map()` kall)
- [ ] Skriv unit tests for 4 test cases ovenfor
- [ ] Test manuelt på ekte systemskjema PDF
- [ ] Sammenlign før/etter koordinater (debug logging)
- [ ] Commit med message: "feat: add text verification for component coordinates"

---

## Resultat

### Før
```json
{
  "code": "RTA4001",
  "x": 150,  // Fra linje med "360.0001-RTA4001"
  "y": 380,
  "verifiedByText": false,
  "confidence": 0.5
}
```

### Etter
```json
{
  "code": "RTA4001",
  "x": 245,  // Eksakt midtpunkt av "RTA4001" tekst
  "y": 385,
  "verifiedByText": true,
  "matchedText": "RTA4001",
  "confidence": 0.95
}
```

**Forbedring**: Mer presise koordinater som peker direkte til komponenten! 🎯
