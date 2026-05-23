---
name: lead-scoring
description: Use when the user asks "qué deals están calientes", "cuáles tengo que empujar", "explícame el score del deal X", or "por qué este deal está frío". The score is a deterministic 0–100 heuristic computed on demand by the backend; this skill explains it in product language and proposes next steps. Read-only by default.
---

# Lead Scoring

This skill is for the agent, not for the end user.

Use it for any question about which deals to prioritize today, why a specific deal got the score it got, or what to do next on a cold deal.

## Source of Truth

Read the app `AGENTS.md` before using this skill. If this skill and `AGENTS.md` appear to conflict, follow `AGENTS.md`.

## User-Facing Capability

The visible capability is:

"CRM OS calcula un puntaje de 0 a 100 por cada deal abierto, basado en señales observables (probabilidad del stage, engagement reciente, respuestas inbound, antigüedad de actividad y monto). El puntaje viene con la explicación de cómo se compone."

Avoid wording like:

- "Estoy llamando al endpoint `/api/deals/{id}/score`."
- "El factor `stage_probability` aporta 18 puntos."

Use product language: "el stage `Negociacion` aporta 21 puntos al score; ese deal tuvo 3 actividades completadas en los últimos 30 días, lo que aporta otros 12 puntos."

## How the score is composed (factors)

The backend returns 5 factors summing to 0–100:

| Factor | Peso | Lo que mide |
|---|---|---|
| `stage_probability` | 30 | Probabilidad default del stage actual del deal |
| `recent_engagement` | 25 | Actividades completadas en los últimos 30 días (satura en 6) |
| `inbound_reply` | 20 | Si el contacto principal respondió por email en los últimos 14 días |
| `freshness` | 15 | Días desde la última actividad (lleno <7 días, mitad 7–30, cero >30) |
| `amount_pressure` | 10 | Monto del deal en escala logarítmica vs el max abierto del pipeline |

Bands:

- `hot` ≥ 65
- `cold` ≤ 34
- `warm` en medio

## Internal Workflow

### "Qué deals están calientes"

1. Llamar `GET /api/reports/lead-scoring?pipeline_id=<default-or-asked>&limit=5`.
2. Devolver los 5 deals de `hot` en lenguaje funcional: título, stage, monto, score. Mencionar la moneda por separado por deal (sin convertir).
3. Si la lista hot está vacía, decir "Hoy ningún deal supera el umbral caliente" y proponer ver los cold del mismo report para encontrar qué activar primero.

### "Por qué este deal está [hot|warm|cold]"

1. Llamar `GET /api/deals/{deal_id}/score`.
2. Listar los factores ordenados por contribución descendente, con el `detail` que devuelve cada uno como explicación humana.
3. Proponer la acción concreta más alta-leverage según qué factor está bajo:
   - `stage_probability` bajo → "está en stage temprano, conviene avanzarlo si tienes señales del cliente".
   - `recent_engagement` bajo → "no hubo actividad reciente, agenda una llamada o un email".
   - `inbound_reply = 0` → "el cliente no respondió hace ≥14 días, sugiero un follow-up suave hoy".
   - `freshness` bajo (>30 días) → "el deal está dormido; o lo reactivás o lo marcás perdido para limpiar el pipeline".
   - `amount_pressure` bajo → señal informativa, no accionable directamente.

### "Cuáles tengo que empujar"

1. Pull `GET /api/reports/lead-scoring`.
2. Combinar `hot` (high leverage, ya están moviéndose) con la mitad inferior de `cold` que tiene `stage_probability > 30` (deals que estaban prometedores pero se enfriaron). Mostrar ambos grupos separados con la razón de cada uno.

### Acciones derivadas

Esta skill **no escribe** por defecto. Si el usuario después de leer el score dice "agendá una llamada con este contacto" o "envía un follow-up", pasale el control a `crm-data-entry` o `crm-followup-draft` con la decisión confirmada.

## Boundaries

- Read-only.
- No invento factores fuera de los 5 declarados. Si Forger más adelante suma más señales, el endpoint las devuelve y esta skill las muestra; pero la skill no inventa explicaciones que el endpoint no incluya en `detail`.
- No re-calculo el score con mi propia heurística. El endpoint es la verdad.
- No convierto montos entre monedas.
- No expongo IDs internos ni rutas en la respuesta al usuario salvo que pregunte por detalles técnicos.
- Si un deal no existe, devuelvo el error funcional ("no encontré ese deal"), no intento crearlo.
