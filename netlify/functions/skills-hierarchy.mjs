export const roleKey = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function validateHierarchy(r,f,p,worker,superior){
 if(!f?.approval||f.status!=='APROBADO') throw Error('El perfil de origen MC1507 no está aprobado o no existe.');
 if(Number(f.revision)!==Number(r.profileRevision)||f.skills!==r.sourceSkills) throw Error('El perfil de origen cambió. Calidad debe revisar el borrador antes de compartirlo.');
 if(!worker||worker.active===false||roleKey(worker.position)!==roleKey(f.position)) throw Error('El trabajador no coincide con el perfil aprobado.');
 if(!p||p.active===false||r.personId===r.evaluatorId||!roleKey(p.position)) throw Error('Seleccione un evaluador activo distinto del trabajador.');
 const direct=roleKey(f.reportTo), actual=roleKey(p.position);
 if(direct){if(direct!==actual) throw Error('El perfil MC1507 establece como superior: '+f.reportTo+'. Evaluador seleccionado: '+p.position+'.');return;}
 if(superior?.status==='APROBADO'&&superior.approval&&roleKey(superior.position)===actual&&Array.isArray(superior.subordinatePositions)&&superior.subordinatePositions.some(x=>roleKey(x)===roleKey(f.position)))return;
 throw Error('No existe una relación jerárquica aprobada para este evaluador. Revise Reporta a o Personal a cargo en MC1507.');
}
