# grifosmori.com

Sitio de Grifos Mori — estación de servicio en la Panamericana Norte Km 783,
sector Mocce, Lambayeque.

HTML, CSS y JavaScript sin framework ni dependencias. Se publica solo, con
GitHub Pages.

## Los precios se actualizan solos

`scraper/facilito.py` lee el precio declarado a Osinergmin en
[facilito.gob.pe](https://www.facilito.gob.pe/) y escribe `sitio/precios.json`.
Corre tres veces al día (10:00, 14:00 y 18:00 de Lima) desde
`.github/workflows/precios.yml`.

La estación se identifica **por su código Osinergmin `7675`**, nunca por
nombre: en el mismo tramo de carretera opera otra empresa con «Mori» en la
razón social, y varios directorios les cruzan la dirección.

El scraper falla cerrado: si Facilito no responde o devuelve algo que no
reconoce, no escribe nada y el paso sale en rojo. La web prefiere mostrar el
último precio bueno con su fecha antes que un precio inventado.

## Estructura

    sitio/          lo que se publica
    sitio/puntos/   el programa de puntos, en su propia página
    scraper/        la lectura de Facilito
    datos/          histórico de precios, una línea por lectura

## Publicar

Cada `push` a `main` despliega. No hay build: los archivos de `sitio/` se
suben tal cual.

---

Hecho por [CREAM](https://cream.pe). La documentación interna del encargo no
vive acá.
