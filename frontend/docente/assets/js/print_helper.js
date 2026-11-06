/**
 * print_helper.js
 * Helper aislado para la impresión detallada de evaluaciones de preescolar.
 * No modifica el estado global, solo lee el state para generar el HTML de impresión.
 */

window.imprimirDetallePreescolar = function(alumnoId) {
    // 1. Obtener datos del alumno y su evaluación desde el state global
    const alumno = window.state?.alumnos?.find(a => a.alumnoId === alumnoId);
    const ev = window.state?.evaluaciones?.[alumnoId] || {};

    if (!alumno) {
        alert('No se encontró la información del alumno.');
        return;
    }

    // 2. Definición de dimensiones para preescolar
    const dims = [
        { key: 'cognitivo', titulo: 'Desarrollo Cognitivo', nivel: ev.desempenoCognitivo, obs: 'obsAprendizaje,obsComprension,obsMemoria' },
        { key: 'socioemocional', titulo: 'Desarrollo Socioemocional', nivel: ev.desempenoSocioemocional, obs: 'obsHabilidadesComunicacion,obsHabilidadesSociales,obsConvivenciaAutogestion,obsAutonomiaIndependencia,obsResolucionConflictos' },
        { key: 'fisico', titulo: 'Desarrollo Físico', nivel: ev.desempenoFisico, obs: 'obsMotricidadGruesaFina,obsCoordinacionEquilibrio' }
    ];

    // 3. Construir el HTML para la impresión
    let html = `
    <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: auto;">
        <div style="text-align: center; border-bottom: 2px solid #7a1d2c; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="color: #7a1d2c; margin: 0;">Instituto Wilhelm Wundt SC</h1>
            <h2 style="margin: 10px 0; font-weight: normal;">Reporte Detallado de Evaluación Preescolar</h2>
            <p style="font-size: 1.1rem;"><b>Alumno:</b> ${alumno.nombre} | <b>ID:</b> ${alumnoId} | <b>Grado:</b> ${alumno.grado}</p>
        </div>

        <div style="margin-bottom: 30px;">
            <h3 style="background: #f0f0f0; padding: 10px; border-left: 5px solid #7a1d2c;">Observaciones Generales</h3>
            <p style="padding: 10px; font-style: italic; line-height: 1.6;">${ev.observaciones || 'Sin observaciones generales.'}</p>
        </div>

        <div style="display: grid; gap: 20px;">
    `;

    dims.forEach(dim => {
        const nivelTxt = { 1: 'Necesita apoyo', 2: 'En desarrollo', 3: 'Logro esperado', 4: 'Desempeño sobresaliente' }[dim.nivel] || 'No evaluado';

        html += `
        <div style="border: 1px solid #ddd; border-radius: 10px; padding: 20px; page-break-inside: avoid;">
            <h3 style="color: #1e40af; margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                ${dim.titulo} <span style="float: right; color: #666;">Nivel: ${dim.nivel} (${nivelTxt})</span>
            </h3>
            <div style="margin-top: 15px;">
        `;

        // Agregar cada sub-aspecto de la dimensión
        const subKeys = dim.obs.split(',');
        subKeys.forEach(key => {
            const valor = ev[key];
            if (valor) {
                html += `
                <div style="margin-bottom: 10px;">
                    <b style="font-size: 0.9rem; color: #555;">${key.replace('obs', '').replace(/([A-Z])/g, ' $1').trim()}:</b>
                    <p style="margin: 5px 0; font-size: 0.95rem; line-height: 1.4;">${valor}</p>
                </div>
                `;
            }
        });

        if (Object.values(ev).filter(v => v && typeof v === 'string').length === 0) {
            html += `<p style="color: #999; font-size: 0.9rem;">Sin observaciones detalladas en esta dimensión.</p>`;
        }

        html += `</div></div>`;
    });

    html += `
        </div>
        <div style="margin-top: 50px; text-align: center;">
            <p style="font-size: 0.9rem; color: #777;">Impreso el: ${new Date().toLocaleDateString('es-MX')}</p>
            <div style="margin-top: 40px; width: 250px; border-top: 1px solid #000; margin-left: auto; margin-right: auto; padding-top: 10px;">
                <p style="font-size: 0.9rem; font-weight: bold;">Firma del Docente</p>
            </div>
        </div>
    </div>
    `;

    // 4. Abrir ventana de impresión
    const win = window.open('', '_blank');
    win.document.write('<html><head><title>Reporte Preescolar</title></head><body onload="window.print()">');
    win.document.write(html);
    win.document.write('</body></html>');
    win.document.close();
}
