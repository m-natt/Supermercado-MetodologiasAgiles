/* Supermercado Bonito :3 — Denuncias y reembolsos (demo)
 * No requiere editar catalogo.js, historial.js ni HTML.
 * Carga este archivo en la página (DevTools > Console) y deja solicitudes.css junto a él.
 */
(() => {
  if (window.__solicitudesDemoInstalado) return;
  window.__solicitudesDemoInstalado = true;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('./solicitudes.css', location.href).href;
  document.head.appendChild(css);

  const guardar = (tipo, datos) => {
    const clave = 'supermercado_solicitudes_demo';
    const lista = JSON.parse(localStorage.getItem(clave) || '[]');
    const folio = `${tipo === 'DEN' ? 'DEN' : 'REE'}-${Date.now().toString().slice(-8)}`;
    lista.push({ folio, tipo: tipo === 'DEN' ? 'Denuncia' : 'Reembolso', fecha: new Date().toLocaleString('es-MX'), estado: 'Recibida (demostración)', ...datos });
    localStorage.setItem(clave, JSON.stringify(lista));
    return folio;
  };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const field = (label, control) => { const w = el('label', 'sd-field'); w.append(el('span', '', label), control); return w; };
  const input = (placeholder = '', type = 'text') => { const n = el('input', ''); n.type = type; n.placeholder = placeholder; return n; };
  const select = (items) => { const n = el('select'); items.forEach((v, i) => { const o = el('option', '', v); o.value = i ? v : ''; n.append(o); }); return n; };
  const area = (placeholder) => { const n = el('textarea'); n.placeholder = placeholder; n.rows = 4; return n; };

  function abrirModal(tipo, datos) {
    document.querySelector('.sd-overlay')?.remove();
    const overlay = el('div', 'sd-overlay');
    const modal = el('section', 'sd-modal'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    const head = el('header', 'sd-head');
    const titulo = tipo === 'DEN' ? 'Denunciar producto o vendedor' : 'Solicitar reembolso';
    head.append(el('div', 'sd-kicker', 'SUPERMERCADO BONITO :3'), el('h2', '', titulo));
    const cerrar = el('button', 'sd-x', '×'); cerrar.type = 'button'; cerrar.setAttribute('aria-label', 'Cerrar'); cerrar.onclick = () => overlay.remove(); head.append(cerrar);
    const form = el('form', 'sd-form');
    const resumen = el('div', 'sd-summary');
    if (tipo === 'DEN') {
      resumen.append(el('strong', '', datos.producto || 'Producto seleccionado'), el('span', '', datos.precio || 'Denuncia sobre este artículo'));
      const objetivo = select(['Selecciona una opción', 'Producto', 'Vendedor', 'Producto y vendedor']);
      const motivo = select(['Selecciona el motivo', 'Producto engañoso o diferente', 'Producto dañado o defectuoso', 'Información falsa', 'Problema con el vendedor', 'Precio o cobro incorrecto', 'Otro']);
      const detalle = area('Describe qué ocurrió y por qué deseas realizar la denuncia…');
      const contacto = input('correo@ejemplo.com', 'email');
      form.append(field('¿Qué deseas denunciar?', objetivo), field('Motivo de la denuncia', motivo), field('Explicación de la queja', detalle), field('Correo de contacto', contacto));
      form._validar = () => objetivo.value && motivo.value && detalle.value.trim().length >= 8 && contacto.value.includes('@');
      form._datos = () => ({ producto: datos.producto, precio: datos.precio, objetivo: objetivo.value, motivo: motivo.value, explicacion: detalle.value.trim(), contacto: contacto.value });
    } else {
      resumen.append(el('strong', '', `Pedido #${datos.pedido || 'No identificado'}`), el('span', '', datos.resumen || 'Solicitud de devolución de compra'));
      const producto = select(['Selecciona el producto', ...(datos.productos || ['Compra completa'])]);
      const motivo = select(['Selecciona el motivo', 'Producto dañado', 'Producto incorrecto', 'Producto incompleto', 'No recibí el producto', 'Cobro duplicado o incorrecto', 'Ya no deseo el producto', 'Otro']);
      const metodo = select(['Selecciona cómo deseas recibirlo', 'Método de pago original', 'Saldo a favor en la cuenta']);
      const cantidad = input('1', 'number'); cantidad.min = '1'; cantidad.value = '1';
      const detalle = area('Explica el motivo de tu solicitud y cualquier detalle importante…');
      const contacto = input('correo@ejemplo.com', 'email');
      form.append(field('Producto a reembolsar', producto), field('Cantidad', cantidad), field('Motivo del reembolso', motivo), field('Método de reembolso preferido', metodo), field('Explicación', detalle), field('Correo de contacto', contacto));
      form._validar = () => producto.value && motivo.value && metodo.value && Number(cantidad.value) > 0 && detalle.value.trim().length >= 8 && contacto.value.includes('@');
      form._datos = () => ({ pedido: datos.pedido, producto: producto.value, cantidad: Number(cantidad.value), motivo: motivo.value, metodo: metodo.value, explicacion: detalle.value.trim(), contacto: contacto.value, total_compra: datos.total || '' });
    }
    const nota = el('p', 'sd-note', 'Demostración: esta solicitud se registra localmente y no genera una gestión real.');
    const acciones = el('div', 'sd-actions'); const cancelar = el('button', 'sd-btn sd-btn-light', 'Cancelar'); cancelar.type = 'button'; cancelar.onclick = () => overlay.remove();
    const enviar = el('button', 'sd-btn sd-btn-primary', tipo === 'DEN' ? 'Enviar denuncia' : 'Enviar solicitud'); enviar.type = 'submit'; acciones.append(cancelar, enviar);
    form.append(nota, acciones);
    form.addEventListener('submit', e => { e.preventDefault(); if (!form._validar()) { aviso.textContent = 'Completa todos los campos correctamente. La explicación debe tener al menos 8 caracteres.'; aviso.className = 'sd-alert sd-alert-error'; return; } const folio = guardar(tipo, form._datos()); form.replaceChildren(); const ok = el('div', 'sd-success'); ok.append(el('div', 'sd-check', '✓'), el('h3', '', tipo === 'DEN' ? 'Denuncia enviada' : 'Solicitud registrada'), el('p', '', 'Tu información quedó registrada en esta demostración.'), el('strong', 'sd-folio', `Folio: ${folio}`), el('p', 'sd-muted', 'Puedes cerrar esta ventana. No se ha realizado ningún envío al servidor.')); const done = el('button', 'sd-btn sd-btn-primary', 'Entendido'); done.type = 'button'; done.onclick = () => overlay.remove(); ok.append(done); form.append(ok); });
    const aviso = el('p', 'sd-alert'); aviso.setAttribute('role', 'alert'); form.prepend(aviso);
    modal.append(head, resumen, form); overlay.append(modal); overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); }); document.body.append(overlay);
  }

  function agregarBotonProducto() {
    const contenido = document.querySelector('#dialog-content');
    if (!contenido || !contenido.querySelector('.dialog-title') || contenido.querySelector('[data-sd-denuncia]')) return;
    const producto = contenido.querySelector('.dialog-title')?.textContent?.trim() || 'Producto';
    const precio = contenido.querySelector('.price')?.textContent?.trim() || '';
    const b = el('button', 'sd-entry sd-entry-report', '⚑ Denunciar producto / vendedor'); b.type = 'button'; b.dataset.sdDenuncia = '1'; b.onclick = () => abrirModal('DEN', { producto, precio }); contenido.append(b);
  }
  function agregarBotonesPedidos() {
    document.querySelectorAll('#orders-list .hist-order').forEach(card => {
      if (card.querySelector('[data-sd-reembolso]')) return;
      const titulo = card.querySelector('.hist-order__title')?.textContent || '';
      const pedido = (titulo.match(/#\s*(\S+)/) || [])[1] || 'No identificado';
      const total = card.querySelector('.hist-order__total')?.textContent || '';
      const productos = [...card.querySelectorAll('.hist-item__name')].map(n => n.textContent.trim());
      const acciones = card.querySelector('.hist-order__actions') || card.querySelector('.hist-order__foot');
      if (!acciones) return;
      const b = el('button', 'sd-entry sd-entry-refund', '↩ Solicitar reembolso'); b.type = 'button'; b.dataset.sdReembolso = '1'; b.onclick = () => abrirModal('REE', { pedido, total, resumen: total, productos }); acciones.append(b);
    });
  }
  const observar = () => { agregarBotonProducto(); agregarBotonesPedidos(); };
  const observer = new MutationObserver(observar); observer.observe(document.documentElement, { childList: true, subtree: true });
  observar();
  console.info('Solicitudes demo cargadas. Botones de denuncia y reembolso disponibles donde corresponde.');
})();
