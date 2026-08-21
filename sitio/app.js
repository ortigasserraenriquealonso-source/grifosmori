/* =============================================================================
   Grifos Mori — comportamiento de la página.
   Sin dependencias. Todo lo que se muestra sale de los tres .json de al lado.
   ========================================================================== */

const WA = "https://wa.me/51978720291";

/* Este archivo lo comparten la portada y /puntos/. Como esa vive una carpeta
   más abajo, las rutas de los .json salen de <html data-base="../">. */
const BASE = document.documentElement.dataset.base || "";

/* --- Menú en celular ------------------------------------------------------ */
(() => {
  const boton = document.querySelector(".menu-btn");
  const nav = document.getElementById("nav");
  if (!boton || !nav) return;

  boton.addEventListener("click", () => {
    const abierto = nav.dataset.abierto === "si";
    nav.dataset.abierto = abierto ? "no" : "si";
    boton.setAttribute("aria-expanded", String(!abierto));
  });
  // Al elegir una sección el menú se cierra solo.
  nav.addEventListener("click", (e) => {
    if (e.target.tagName !== "A") return;
    nav.dataset.abierto = "no";
    boton.setAttribute("aria-expanded", "false");
  });
})();

/* --- Llegar bien cuando la página se abre con un ancla ---------------------
   El navegador salta al ancla apenas tiene el HTML, pero para entonces faltan
   tres cosas que mueven el suelo: el contenido que pinta el JS, las tipografías
   —al pasar de la de respaldo a la definitiva cambia la altura de cada bloque
   de texto— y las portadas de los videos. El resultado es que se ve media
   sección; y en un celular ni recargando se acomoda, porque todo eso tarda más.

   En vez de adivinar cuántos milisegundos esperar, se vigila la altura del
   documento y se recoloca cada vez que cambia, hasta que se estabiliza. Y a la
   primera señal de que la persona quiere moverse ella misma, se deja de
   insistir: corregir la posición está bien, pelear con el usuario no.
--------------------------------------------------------------------------- */
(() => {
  if (!location.hash) return;
  const id = decodeURIComponent(location.hash.slice(1));
  if (!document.getElementById(id)) return;

  // El salto inicial del navegador usa `scroll-behavior: smooth`, así que sigue
  // animándose mientras nosotros corregimos, y termina pisando la corrección.
  // Se apaga mientras dura el ajuste y se devuelve al soltar.
  const raiz = document.documentElement;
  raiz.style.scrollBehavior = "auto";

  let activo = true;
  const rendirse = () => {
    if (!activo) return;
    activo = false;
    raiz.style.scrollBehavior = "";
  };
  for (const ev of ["wheel", "touchstart", "keydown", "mousedown"]) {
    addEventListener(ev, rendirse, { passive: true, once: true });
  }
  setTimeout(rendirse, 4000);   // techo duro: nunca más allá de esto

  const recolocar = () => {
    if (!activo) return;
    // 'auto' y no 'smooth': acá se corrige una posición, no se hace un viaje.
    document.getElementById(id).scrollIntoView({ behavior: "auto", block: "start" });
  };

  addEventListener("load", recolocar, { once: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(recolocar));
  }
  if ("ResizeObserver" in window) {
    let alto = document.body.scrollHeight;
    const vigia = new ResizeObserver(() => {
      if (!activo) { vigia.disconnect(); return; }
      if (document.body.scrollHeight === alto) return;
      alto = document.body.scrollHeight;
      requestAnimationFrame(recolocar);
    });
    vigia.observe(document.body);
  }
})();

/* --- Año del pie ---------------------------------------------------------- */
(() => {
  const el = document.getElementById("anio");
  if (el) el.textContent = String(new Date().getFullYear());
})();

/* --- Precios del día ------------------------------------------------------
   Regla dura: la hora que se muestra sale SIEMPRE del campo `actualizado_utc`
   del JSON, nunca del reloj del visitante. Y si la lectura tiene más de 48 h,
   no se muestra ningún precio: se ofrece el WhatsApp. Un precio viejo visible
   es un problema con INDECOPI; un precio ausente, no.
--------------------------------------------------------------------------- */
const HORAS_MAXIMAS = 48;

function haceCuanto(fecha) {
  const min = Math.round((Date.now() - fecha.getTime()) / 60000);
  if (min < 2) return "recién";
  if (min < 60) return `hace ${min} minutos`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

function mostrarCaido() {
  const cargando = document.getElementById("precios-cargando");
  if (cargando) cargando.remove();
  document.getElementById("lista-precios")?.setAttribute("hidden", "");
  document.getElementById("precios-caido")?.removeAttribute("hidden");
}

function pintarPrecios(datos) {
  const lista = document.getElementById("lista-precios");
  const tpl = document.getElementById("tpl-precio");
  const cargando = document.getElementById("precios-cargando");
  if (!lista || !tpl) return;

  const actualizado = new Date(datos.actualizado_utc);
  const horas = (Date.now() - actualizado.getTime()) / 3.6e6;
  if (!Number.isFinite(horas)) return mostrarCaido();
  if (!Array.isArray(datos.combustibles) || !datos.combustibles.length) return mostrarCaido();

  // El único reloj disponible en el navegador es el del visitante, y puede
  // estar mal puesto. Si la antigüedad que sale de restarlo es imposible
  // —negativa, o de más de un mes— el reloj no es de fiar: en ese caso se
  // muestran los precios con su fecha absoluta, que sí es verificable, en vez
  // de esconderlos por culpa de un celular desincronizado.
  const relojCreible = horas > -1 && horas < 24 * 30;
  if (relojCreible && horas > HORAS_MAXIMAS) return mostrarCaido();

  if (cargando) cargando.remove();

  for (const c of datos.combustibles) {
    const nodo = tpl.content.cloneNode(true);
    const fila = nodo.querySelector(".precio");
    if (c.estrella) {
      fila.classList.add("precio--estrella");
      nodo.querySelector(".precio__etiqueta").removeAttribute("hidden");
    }
    nodo.querySelector(".precio__nombre").textContent = c.producto;
    nodo.querySelector(".precio__monto span").textContent = c.precio.toFixed(2);
    lista.append(nodo);
  }

  const frescura = document.getElementById("frescura");
  if (frescura) {
    // El indicador queda sin texto: es solo el punto de color al lado del
    // título. La información sigue estando, en el tooltip y para los lectores
    // de pantalla, para no perder el dato de cuándo se consultó la fuente.
    const consulta = relojCreible
      ? `Consultado a Osinergmin ${haceCuanto(actualizado)}`
      : `Consultado a Osinergmin el ${datos.actualizado_lima}`;
    const vigencia = datos.precios_desde_lima
      ? ` · precio vigente desde el ${datos.precios_desde_lima}`
      : "";
    frescura.textContent = "";
    frescura.title = consulta + vigencia;
    frescura.setAttribute("aria-label", consulta + vigencia);
    // Pasadas 12 h el punto verde se vuelve ámbar: sigue siendo válido, pero
    // el visitante merece saber que no es de esta mañana.
    frescura.dataset.estado = relojCreible && horas > 12 ? "viejo" : "fresco";
    frescura.removeAttribute("hidden");
  }

  enriquecerJsonLd(datos);
}

/* Mete los mismos precios en el JSON-LD. Si la página dice un número y los
   datos estructurados dicen otro, Google lo trata como contenido discordante. */
function enriquecerJsonLd(datos) {
  const script = document.getElementById("jsonld");
  if (!script) return;
  try {
    const ld = JSON.parse(script.textContent);
    ld.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: "Combustibles",
      itemListElement: datos.combustibles.map((c) => ({
        "@type": "Offer",
        name: c.producto,
        url: "https://grifosmori.com/#precios",
        price: c.precio.toFixed(2),
        priceCurrency: "PEN",
        availability: "https://schema.org/InStock",
        itemOffered: { "@type": "Product", name: c.producto },
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: c.precio.toFixed(2),
          priceCurrency: "PEN",
          unitCode: "GLL",            // UN/CEFACT: galón
          valueAddedTaxIncluded: true,
          validFrom: datos.actualizado_utc,
        },
      })),
    };
    script.textContent = JSON.stringify(ld);
  } catch {
    /* Si el JSON-LD no se puede tocar, la página sigue funcionando igual. */
  }
}

if (document.getElementById("lista-precios")) {
fetch(BASE + "precios.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then(pintarPrecios)
  .catch(mostrarCaido);
}

/* --- Puntos y premios ----------------------------------------------------- */
let CATALOGOS = [];
let catalogoActivo = "petroleo";

function galonesAlMes() {
  const input = document.getElementById("galones");
  const n = Number(input?.value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20000) : 0;
}

function pintarPremios() {
  const panel = document.getElementById("panel-premios");
  const cat = CATALOGOS.find((c) => c.id === catalogoActivo);
  if (!panel || !cat) return;

  const porMes = galonesAlMes();
  panel.textContent = "";

  for (const premio of cat.premios) {
    const card = document.createElement("article");
    card.className = "premio";

    const nombre = document.createElement("h3");
    nombre.className = "premio__nombre";
    nombre.textContent = premio.nombre;

    const puntos = document.createElement("p");
    puntos.className = "premio__puntos";
    puntos.textContent = premio.puntos.toLocaleString("es-PE");
    // Solo "puntos": como un galón es un punto, repetir la cifra en galones
    // no agrega nada y la regla ya está en grande arriba del catálogo.
    const unidad = document.createElement("small");
    unidad.textContent = "puntos";
    puntos.append(unidad);

    const meta = document.createElement("p");
    meta.className = "premio__meta";
    if (porMes > 0) {
      const meses = Math.ceil(premio.puntos / porMes);
      meta.textContent = meses <= 1
        ? "Lo alcanzas este mes"
        : `Lo alcanzas en ${meses} meses`;
    }

    card.append(nombre, puntos, meta);
    panel.append(card);
  }

  const salida = document.getElementById("salida-simulador");
  if (salida) {
    salida.textContent = porMes > 0
      ? `Con ${porMes.toLocaleString("es-PE")} galones al mes acumulas ${porMes.toLocaleString("es-PE")} puntos al mes. Cada premio te dice en cuánto tiempo lo alcanzas.`
      : "Escribe cuántos galones cargas al mes y te decimos en cuánto tiempo llegas a cada premio.";
  }
}

// El catálogo hace falta en dos sitios: en /puntos/ para pintarlo, y en la
// portada solo para contar cuántos premios hay en el adelanto.
if (document.getElementById("panel-premios") || document.getElementById("mas-premios")) {
fetch(BASE + "premios.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((datos) => {
    // El adelanto de la portada dice cuántos premios hay: el número sale del
    // propio catálogo y no escrito a mano, que hoy cuadra y mañana miente.
    const mas = document.getElementById("mas-premios");
    if (mas) {
      const total = (datos.catalogos || [])
        .filter((c) => c.confirmado !== false)
        .reduce((n, c) => n + (c.premios || []).length, 0);
      const enMuestra = document.querySelectorAll(".muestra li").length - 1;
      const restantes = total - enMuestra;
      if (restantes > 0) mas.textContent = `y ${restantes} premios más →`;
    }

    // `confirmado: false` significa que esos puntajes todavía no los validó el
    // cliente. Publicar un puntaje sin confirmar obliga igual (Ley 29571
    // art. 14.1), así que esa pestaña no se muestra hasta que lo confirme.
    const todos = datos.catalogos || [];
    CATALOGOS = todos.filter((c) => c.confirmado !== false);
    const ocultos = todos.filter((c) => c.confirmado === false);

    for (const c of ocultos) {
      const tab = document.querySelector(`.tab[data-catalogo="${c.id}"]`);
      if (tab) tab.remove();
    }
    if (CATALOGOS.length && !CATALOGOS.some((c) => c.id === catalogoActivo)) {
      catalogoActivo = CATALOGOS[0].id;
      const tab = document.querySelector(`.tab[data-catalogo="${catalogoActivo}"]`);
      if (tab) tab.setAttribute("aria-selected", "true");
    }
    if (ocultos.length) {
      const aviso = document.getElementById("vigencia-premios");
      if (aviso) {
        aviso.textContent = `${aviso.textContent.trim()} El catálogo de ` +
          ocultos.map((c) => c.nombre.toLowerCase()).join(" y ") +
          " lo consultas por WhatsApp o en la estación.";
      }
    }
    pintarPremios();
  })
  .catch(() => {
    const panel = document.getElementById("panel-premios");
    if (panel) {
      panel.innerHTML =
        `<p class="reels__vacio">No pudimos cargar el catálogo de premios.
         <a href="${WA}?text=Hola%20Grifos%20Mori%2C%20quiero%20ver%20el%20cat%C3%A1logo%20de%20premios.%20%5Bweb-premios%5D"
            target="_blank" rel="noopener" style="color:var(--amarillo)">Pídelo por WhatsApp</a>.</p>`;
    }
  });
}

/* Se consulta el DOM en cada uso y no una sola vez al cargar: el catálogo sin
   confirmar se borra DESPUÉS, cuando llega premios.json, y una lista guardada
   antes conservaría un nodo ya desconectado. */
const tabs = () => [...document.querySelectorAll(".tab")];

function activarTab(tab, moverFoco = false) {
  if (!tab || !tab.isConnected) return;
  for (const t of tabs()) {
    const activa = t === tab;
    t.setAttribute("aria-selected", String(activa));
    // Tabindex rotatorio: dentro de un tablist, Tab entra y sale del grupo una vez
    // y las flechas mueven entre pestañas. Sin esto hay que tabular por todas.
    t.tabIndex = activa ? 0 : -1;
  }
  document.getElementById("panel-premios")?.setAttribute("aria-labelledby", tab.id);
  catalogoActivo = tab.dataset.catalogo;
  pintarPremios();
  if (moverFoco) tab.focus();
}

tabs().forEach((tab) => {
  tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
  tab.addEventListener("click", () => activarTab(tab));
  tab.addEventListener("keydown", (e) => {
    const salto = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity }[e.key];
    if (salto === undefined) return;
    e.preventDefault();
    // La lista se vuelve a leer acá: si quedó una sola pestaña, las flechas
    // no hacen nada en vez de dejarla deseleccionada y fuera del tabulador.
    const vivas = tabs();
    if (vivas.length < 2) return;
    const i = vivas.indexOf(tab);
    const destino = !Number.isFinite(salto)
      ? (salto < 0 ? vivas[0] : vivas[vivas.length - 1])
      : vivas[(i + salto + vivas.length) % vivas.length];
    activarTab(destino, true);
  });
});

document.getElementById("galones")?.addEventListener("input", pintarPremios);

/* --- Reels de Instagram ---------------------------------------------------
   Fachada pura: una portada propia y un enlace. Sin embed.js de Meta, sin
   iframes y sin re-hospedar nada. El embed oficial de Instagram cuesta unos
   480 KB comprimidos para cuatro publicaciones; esto cuesta las portadas.
--------------------------------------------------------------------------- */
if (document.getElementById("reels")) {
fetch(BASE + "reels.json")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((datos) => {
    const cont = document.getElementById("reels");
    if (!cont) return;
    const reels = (datos.reels || []).filter((r) => r.url && r.portada);

    if (!reels.length) {
      cont.innerHTML =
        `<p class="reels__vacio">Estamos preparando esta sección.
         Mientras tanto, todo está en <a href="https://www.instagram.com/grifosmori/"
         target="_blank" rel="noopener" style="color:var(--amarillo)">@grifosmori</a>.</p>`;
      return;
    }

    for (const reel of reels) {
      // Todo esto se arma con nodos y textContent, nunca con innerHTML:
      // reels.json lo edita una persona a mano, y una comilla en un pie de
      // foto bastaría para romper la tarjeta. Con HTML pegado además se podría
      // colar un onerror= o un href="javascript:".
      if (!/^https:\/\//i.test(reel.url) || /^(javascript|data):/i.test(reel.portada)) {
        console.warn("Reel descartado por enlace no válido:", reel.url);
        continue;
      }

      const fig = document.createElement("figure");
      fig.className = "reel";

      const a = document.createElement("a");
      a.href = reel.url;
      a.target = "_blank";
      a.rel = "noopener";

      const img = document.createElement("img");
      img.src = reel.portada;
      img.alt = reel.texto || "Publicación de Grifos Mori";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 540;
      img.height = 960;

      // Sin botón de reproducción propio: la portada que sirve Instagram ya
      // trae el suyo dentro de la imagen, y encimarle otro se ve a dos capas.

      const capa = document.createElement("span");
      capa.className = "reel__capa";
      const cuenta = document.createElement("span");
      cuenta.className = "reel__cuenta";
      cuenta.textContent = "@grifosmori";
      const pie = document.createElement("figcaption");
      pie.textContent = reel.texto || "";
      capa.append(cuenta, pie);

      a.append(img, capa);
      fig.append(a);
      cont.append(fig);
    }
  })
  .catch(() => {
    const cont = document.getElementById("reels");
    if (cont) {
      cont.innerHTML =
        `<p class="reels__vacio">Míranos en <a href="https://www.instagram.com/grifosmori/"
         target="_blank" rel="noopener" style="color:var(--amarillo)">@grifosmori</a>.</p>`;
    }
  });
}

/* --- Botón flotante de WhatsApp -------------------------------------------
   Solo aparece cuando el hero ya quedó atrás. Mientras el hero se ve, el CTA
   grande cumple la función y el flotante solo taparía el precio.
--------------------------------------------------------------------------- */
(() => {
  const boton = document.querySelector(".wa-flotante");
  const hero = document.getElementById("inicio");
  if (!boton || !hero || !("IntersectionObserver" in window)) return;

  boton.dataset.oculto = "si";
  new IntersectionObserver(
    ([e]) => { boton.dataset.oculto = e.isIntersecting ? "si" : "no"; },
    { rootMargin: "-40% 0px 0px 0px" }
  ).observe(hero);
})();

/* =============================================================================
   MOVIMIENTO

   Nada de esto es necesario para leer la página. Si este bloque no corre, el
   <html> nunca recibe la clase `js`, las reglas de aparición no aplican y la
   web se ve entera y quieta. Ese es el comportamiento correcto, no una
   versión degradada.
   ========================================================================== */
(() => {
  const raiz = document.documentElement;
  const quieto = window.matchMedia &&
                 window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Navegador viejo o sistema pidiendo menos movimiento: no se instala nada.
  if (!("IntersectionObserver" in window) || quieto) return;
  raiz.classList.add("js");

  /* --- Aparición al deslizar --------------------------------------------- */
  const animables = document.querySelectorAll(".rv, .esc");

  // Red de seguridad: si algo falla, a los 2,5 s se muestra todo igual. Nunca
  // se puede quedar contenido invisible por culpa de una animación.
  const salvavidas = setTimeout(() => {
    animables.forEach((el) => el.classList.add("in"));
  }, 2500);

  const vigia = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      vigia.unobserve(e.target);     // una vez visible, se deja en paz
    }
    if (![...animables].some((el) => !el.classList.contains("in"))) {
      clearTimeout(salvavidas);
      vigia.disconnect();
    }
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

  animables.forEach((el) => vigia.observe(el));

  // La portada entra sola: ya está en pantalla y no tiene sentido que espere
  // a que alguien deslice. Sin esto, el panel de precios —lo que la gente vino
  // a ver— depende de que el observador responda.
  setTimeout(() => {
    document.querySelectorAll(".hero .rv, .hero .esc, .cabecera .rv")
            .forEach((el) => el.classList.add("in"));
  }, 90);

  /* --- La marca de fondo se mueve más lento que la página ---------------- */
  const fantasmas = document.querySelectorAll(".fantasma");
  if (fantasmas.length) {
    let pedido = false;
    addEventListener("scroll", () => {
      if (pedido) return;
      pedido = true;
      requestAnimationFrame(() => {
        const y = scrollY * 0.18;
        fantasmas.forEach((f) => { f.style.transform = `translate3d(0, ${y}px, 0)`; });
        pedido = false;
      });
    }, { passive: true });
  }

  /* --- Barra de avance, solo donde el navegador no sabe hacerlo solo ------ */
  if (!(window.CSS && CSS.supports && CSS.supports("animation-timeline: scroll()"))) {
    const barra = document.querySelector(".avance");
    if (barra) {
      let pedido = false;
      const pintar = () => {
        // El alto se mide EN CADA pintado: el contenido se inyecta después de
        // instalar esto (precios, catálogo, reels) y una medida tomada al
        // arrancar deja la barra pasada de largo — llegaba a scaleX(1.43).
        const alto = document.body.scrollHeight - innerHeight;
        const avance = alto > 0 ? Math.min(scrollY / alto, 1) : 0;
        // scaleX en vez de width: no toca ni el layout ni la pintura.
        barra.style.transform = `scaleX(${avance})`;
        pedido = false;
      };
      addEventListener("scroll", () => {
        if (!pedido) { pedido = true; requestAnimationFrame(pintar); }
      }, { passive: true });
      pintar();
    }
  }
})();
