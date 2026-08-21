#!/usr/bin/env python3
"""
Lee los precios que Grifos Mori declara oficialmente en Facilito (Osinergmin)
y los escribe en sitio/precios.json, que es lo que muestra la web.

Corre 3 veces al día por GitHub Actions (10:00, 14:00 y 18:00 de Lima).

Regla de oro: si algo sale mal, NO se toca precios.json. La web prefiere
mostrar el precio de hace unas horas antes que quedarse en blanco o mentir.
Por eso todas las validaciones terminan en sys.exit(1) y ninguna en un
archivo a medio escribir.
"""

import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# --- Qué grifo es -----------------------------------------------------------
# El código Osinergmin es el identificador del establecimiento; es lo único
# estable. El nombre y la dirección pueden cambiar de un día para otro.
CODIGO_OSINERGMIN = "7675"          # GRIFOS MORI S.A.C.
LAT, LON = -6.6835084, -79.903534   # Panamericana Norte Km 783 - Mocce
MARGEN = 0.02                       # ~2 km de caja alrededor del grifo

# --- Cómo se llama cada producto de cara al cliente -------------------------
# La clave es el nombre EXACTO que devuelve Facilito, en minúsculas.
# El orden de este diccionario es el orden en que salen en la web:
# el diésel primero porque es el producto estrella.
PRODUCTOS = {
    "diesel b5 s-50 uv": {"nombre": "Diésel B5 S-50 UV", "estrella": True},
    "diesel b5 uv":      {"nombre": "Diésel B5 UV",      "estrella": True},
    "gasohol premium":   {"nombre": "Gasohol Premium",   "estrella": False},
    "gasohol regular":   {"nombre": "Gasohol Regular",   "estrella": False},
    "gasolina premium":  {"nombre": "Gasolina Premium",  "estrella": False},
    "gasolina regular":  {"nombre": "Gasolina Regular",  "estrella": False},
}

URL = "https://www.facilito.gob.pe/facilito/actions/MapaAction.do"
# Facilito devuelve 403 al User-Agent por defecto de urllib/curl.
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36")
TIMEOUT = 45

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "sitio" / "precios.json"
HISTORICO = RAIZ / "datos" / "historico.jsonl"

LIMA = timezone(timedelta(hours=-5))


def contexto_ssl():
    """
    En Linux (que es donde corre el cron) el truststore del sistema alcanza.
    En una Mac con Python de python.org suele faltar, y ahí certifi lo resuelve.
    Nunca se desactiva la verificación.
    """
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def morir(motivo: str) -> None:
    """Sale en rojo sin haber tocado ningún archivo."""
    print(f"ERROR: {motivo}", file=sys.stderr)
    sys.exit(1)


def consultar():
    """Pide a Facilito los grifos alrededor de Grifos Mori."""
    params = {
        "method": "getPoints",
        "tipo": "LIQ",
        "producto": "40",  # el filtro es sobre qué grifos salen, no qué productos
        "latitudeHI": LAT + MARGEN,
        "longitudeHI": LON + MARGEN,
        "latitudeLO": LAT - MARGEN,
        "longitudeLO": LON - MARGEN,
    }
    req = urllib.request.Request(
        f"{URL}?{urllib.parse.urlencode(params)}",
        headers={"User-Agent": UA},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=contexto_ssl()) as r:
            if r.status != 200:
                morir(f"Facilito respondió HTTP {r.status}")
            crudo = r.read()
    except Exception as e:
        morir(f"no se pudo llamar a Facilito: {e}")

    # Facilito sirve ISO-8859-1, no UTF-8. Sin esto las Ñ y las tildes se rompen.
    try:
        return json.loads(crudo.decode("latin-1"))
    except Exception as e:
        morir(f"Facilito no devolvió JSON válido (¿cambió el endpoint?): {e}")


def extraer(datos):
    """Encuentra el establecimiento y traduce sus productos."""
    if not isinstance(datos, list) or not datos:
        morir("la respuesta no es una lista de establecimientos")

    candidatos = [e for e in datos
                  if isinstance(e, dict)
                  and str(e.get("codigoOsinergmin", "")).strip() == CODIGO_OSINERGMIN]
    if not candidatos:
        vistos = ", ".join(str(e.get("codigoOsinergmin")) for e in datos[:10]
                           if isinstance(e, dict))
        morir(f"el código {CODIGO_OSINERGMIN} no está en la respuesta. Vistos: {vistos}")
    if len(candidatos) > 1:
        # Un código identifica un establecimiento. Dos filas con el mismo código
        # significa que la fuente cambió de forma; elegir una al azar sería peor.
        morir(f"el código {CODIGO_OSINERGMIN} aparece {len(candidatos)} veces en la respuesta")
    grifo = candidatos[0]

    lista_productos = grifo.get("productos")
    if not isinstance(lista_productos, list):
        morir(f"el establecimiento no trae una lista de productos: {type(lista_productos).__name__}")

    combustibles = []
    for p in lista_productos:
        if not isinstance(p, dict):
            morir(f"producto con forma inesperada: {p!r}")
        bruto = p.get("producto")
        # Sin este guardia, un `null` de la fuente se publicaba como el
        # combustible «None» — con precio y todo.
        if not isinstance(bruto, str) or not bruto.strip():
            morir(f"producto sin nombre utilizable: {bruto!r}")
        crudo = bruto.strip()
        clave = crudo.lower()
        if clave not in PRODUCTOS:
            # Producto nuevo que no está en el mapa: se publica igual con su
            # nombre oficial. Perder un precio es peor que mostrarlo feo.
            print(f"AVISO: producto no mapeado: {crudo!r}", file=sys.stderr)
            cfg = {"nombre": crudo.title(), "estrella": False}
        else:
            cfg = PRODUCTOS[clave]

        try:
            precio = float(p["precioVenta"])
        except (KeyError, TypeError, ValueError):
            morir(f"precio ilegible en {crudo!r}: {p.get('precioVenta')!r}")

        # Un grifo peruano no vende a S/0 ni a S/100. Si eso llega, la fuente
        # se rompió y publicarlo sería peor que no actualizar.
        if not (1 < precio < 100):
            morir(f"precio fuera de rango en {crudo!r}: {precio}")

        combustibles.append({
            "producto": cfg["nombre"],
            "oficial": crudo,
            "precio": round(precio, 2),
            "estrella": cfg["estrella"],
        })

    if not combustibles:
        morir("el establecimiento no declaró ningún producto")

    # Si el mismo combustible viene dos veces, la web lo pintaría dos veces con
    # dos precios. Publicar dos precios para un mismo producto es exactamente el
    # problema que este scraper existe para evitar.
    por_nombre = {}
    for c in combustibles:
        anterior = por_nombre.get(c["producto"])
        if anterior is not None and anterior != c["precio"]:
            morir(f"{c['producto']!r} viene con dos precios distintos: "
                  f"{anterior} y {c['precio']}")
        por_nombre[c["producto"]] = c["precio"]
    vistos = set()
    combustibles = [c for c in combustibles
                    if not (c["producto"] in vistos or vistos.add(c["producto"]))]

    # Estrella primero; dentro de cada grupo, el orden de PRODUCTOS.
    orden = list(PRODUCTOS)
    combustibles.sort(
        key=lambda c: (not c["estrella"],
                       orden.index(c["oficial"].lower())
                       if c["oficial"].lower() in orden else 99)
    )
    return grifo, combustibles


def precios_anteriores():
    """Lee la publicación anterior para saber si el precio cambió de verdad."""
    try:
        d = json.loads(SALIDA.read_text(encoding="utf-8"))
        return ({c["producto"]: c["precio"] for c in d["combustibles"]},
                d.get("precios_desde"))
    except Exception:
        return {}, None


def main():
    grifo, combustibles = extraer(consultar())
    ahora = datetime.now(timezone.utc)

    # `actualizado_*` es cuándo se LEYÓ: cambia en cada corrida y es lo que
    # mide la frescura. `precios_desde` es desde cuándo rigen estos precios:
    # solo se mueve cuando el precio cambia de verdad. Sin separarlos, no se
    # puede distinguir «el dato está fresco» de «el precio es nuevo».
    antes, desde_antes = precios_anteriores()
    ahora_mapa = {c["producto"]: c["precio"] for c in combustibles}
    cambio = ahora_mapa != antes
    desde = ahora.isoformat(timespec="seconds") if cambio or not desde_antes else desde_antes

    payload = {
        "actualizado_utc": ahora.isoformat(timespec="seconds"),
        "actualizado_lima": ahora.astimezone(LIMA).strftime("%d/%m/%Y %H:%M"),
        "precios_desde": desde,
        "precios_desde_lima": datetime.fromisoformat(desde).astimezone(LIMA).strftime("%d/%m/%Y"),
        "cambio_en_esta_lectura": cambio,
        "fuente": "Facilito — Osinergmin",
        "fuente_url": "https://www.facilito.gob.pe",
        "codigo_osinergmin": CODIGO_OSINERGMIN,
        "establecimiento": str(grifo.get("unidad", "")).strip(),
        "direccion": str(grifo.get("direccion", "")).strip(),
        "combustibles": combustibles,
    }

    # Escritura atómica: primero a un archivo aparte y recién después el
    # reemplazo, que el sistema hace en un solo paso. Si el proceso muere a
    # mitad de camino, precios.json queda como estaba en vez de truncado.
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    temporal = SALIDA.with_suffix(".json.tmp")
    temporal.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporal, SALIDA)

    # El histórico se guarda porque Facilito solo expone el precio de HOY:
    # si no se anota ahora, el dato de ayer no se recupera nunca más.
    HISTORICO.parent.mkdir(parents=True, exist_ok=True)
    with HISTORICO.open("a", encoding="utf-8") as f:
        f.write(json.dumps({
            "t": payload["actualizado_utc"],
            "p": {c["producto"]: c["precio"] for c in combustibles},
        }, ensure_ascii=False) + "\n")

    print(("CAMBIO " if cambio else "SIN CAMBIO ") + payload['actualizado_lima'] + " — " +
          " · ".join(f"{c['producto']}: S/{c['precio']:.2f}" for c in combustibles))


if __name__ == "__main__":
    main()
