# Cómo preparar los .docx para que el bot los rellene

Esto aplica a los 5 templates: **Rafael 404, Xavi 105, Rafael 102, Valen 517, Patricia 518**.

---

## Regla #1: SINGLE braces dentro del .docx

En el `.docx` los placeholders van con **UNA llave** (porque los procesa `docxtemplater`):

```
{APTO_NUM}
{HUESPEDES}
{FECHA_RANGO}
```

**NO uses dos llaves dentro del .docx.** Las dos llaves `{{ }}` solo van en el Sheet (columna `Body_Template` / `Subject_Template`), porque ahí las procesa el motor interno del bot. Son dos motores distintos.

---

## Placeholders disponibles

| Placeholder | Resultado |
|---|---|
| `{APTO}` | `Claudia 201` |
| `{APTO_NUM}` | `201` |
| `{HUESPEDES}` | `Juan Pérez 1019060822`<br>`María López 1036655538` (uno por línea) |
| `{HUESPEDES_SIN_CEDULA}` | `Juan Pérez`<br>`María López` |
| `{FECHA_ENTRADA}` | `17 de mayo` |
| `{FECHA_SALIDA}` | `23 de mayo` |
| `{FECHA_RANGO}` | `Del 17 al 23 de Mayo` |

---

## Regla #2: Escribe el placeholder de un tirón

Word a veces parte el texto internamente en pedazos invisibles si haces cosas como cambiar formato a medio escribir. Si esto le pasa al placeholder, docxtemplater no lo encuentra.

**Cómo evitarlo:**

1. Abre el .docx en Word o Google Docs
2. Borra completamente la frase donde va el placeholder
3. Escríbela DE UN TIRÓN, sin pausas para cambiar negrita/cursiva/color a medio camino
4. Si quieres negrita, selecciona el texto YA escrito y aplícala después

Ejemplo. En vez de hacer esto:

```
Apto número [escribo "404", borro, escribo "{APTO"] [pongo en negrita] _NUM} [quito negrita]
```

Hacelo así:

```
Apto número {APTO_NUM}    ← escribe todo de corrido, sin tocar formato
```

Si después quieres todo el `{APTO_NUM}` en negrita, lo seleccionas con el mouse y das Ctrl+B.

---

## Ejemplo concreto: Rafael 404

**Cómo está hoy (texto hardcoded):**

```
Yo, Rafael Ramírez Pérez identificado con CC 12345678,
propietario del apto 404 del Edificio Santa Clara,
autorizo el ingreso de las siguientes personas:

Carolina Gomez Bautista 1019060822
Bibiana Zapata Restrepo 1036655538

En las fechas: Del 17 al 23 de Mayo

Atentamente,
Rafael Ramírez Pérez
```

**Cómo debe quedar:**

```
Yo, Rafael Ramírez Pérez identificado con CC 12345678,
propietario del apto {APTO_NUM} del Edificio Santa Clara,
autorizo el ingreso de las siguientes personas:

{HUESPEDES}

En las fechas: {FECHA_RANGO}

Atentamente,
Rafael Ramírez Pérez
```

Notas:
- `{APTO_NUM}` reemplaza el número del apto. Para Rafael 404 dará "404", para Rafael 102 dará "102".
- `{HUESPEDES}` se expande en varias líneas automáticamente. El bot pone un huésped por línea, con su cédula al lado, gracias a la opción `linebreaks: true` que activamos en el código.
- `{FECHA_RANGO}` produce "Del 17 al 23 de Mayo" o "Del 30 de mayo al 2 de junio" si cambian de mes.

---

## Para Valen 517 y Patricia 518 (pdf+fotos)

El flujo es: el bot genera el PDF rellenado + adjunta las fotos de cédulas que tú le mandes por Telegram. **Las fotos de cédulas NO van adentro del .docx** — van como adjuntos separados del email.

Por eso, en el .docx solo necesitas los placeholders de texto normales (`{APTO_NUM}`, `{HUESPEDES}`, `{FECHA_RANGO}`). Las fotos las maneja el bot aparte.

---

## Cómo subir el .docx a Drive

1. En Google Drive: **Nuevo → Subir archivo** → sube el `.docx` (NO un Google Doc nativo, debe ser un `.docx`)
2. Si ya está como Google Doc nativo, descárgalo como `.docx`: **Archivo → Descargar → Microsoft Word (.docx)**, luego súbelo
   - O alternativamente: el código soporta Google Docs nativos, los exporta a .docx en runtime. Pero los .docx subidos son más predecibles porque no hay conversión adicional.
3. Click derecho → **Compartir** → pega el correo del service account del bot (termina en `.iam.gserviceaccount.com`) con permiso de "Lector"
4. Copia el link → pégalo en la celda `Doc_Template_URL` del Sheet, para el apto correspondiente

---

## Cómo probar antes de mandar al edificio

Te recomiendo, para cada apto con PDF:

1. Crea un grupo de prueba en WhatsApp solo contigo
2. Crea un correo temporal o usa el tuyo
3. En el Sheet, cambia temporalmente `Destino_WA` o `Destino_Email` a tu grupo/correo de prueba
4. Manda una orden completa al bot
5. Verifica que el PDF se vea correcto (nombres, fechas, cédulas en los lugares correctos)
6. Si todo bien, regresa `Destino_*` al valor real del edificio

---

## Errores comunes y cómo arreglarlos

**"Error rellenando el template: scandalous_tag"**
→ Hay un `{` o `}` suelto en el .docx que docxtemplater está tratando de interpretar. Buscalo y bórralo, o escápalo.

**"unopened_tag" / "unclosed_tag"**
→ Tienes un placeholder mal escrito, ej. `{APTO_NUM` sin la `}` final. Revisa.

**"El placeholder no se reemplazó (queda como {APTO_NUM} en el PDF)"**
→ Word partió el texto. Borra la línea completa y reescribela de un tirón sin tocar formato a medio camino.

**"PDF se ve sin estilo / fuentes raras"**
→ El servidor de Railway usa LibreOffice con fuentes Liberation/DejaVu (instaladas en el Dockerfile). Si tu .docx usa fuentes muy específicas (Calibri, Arial), LibreOffice las sustituye por las equivalentes libres. El resultado es visualmente muy parecido pero no idéntico al original. Si necesitas una fuente exacta, mejor usar fuentes seguras como Arial, Times New Roman, o las Liberation.
