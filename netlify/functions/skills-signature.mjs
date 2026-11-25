import admin from 'firebase-admin';
import {pbkdf2Sync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
function database(){if(!admin.apps.length){const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(!secret||secret.project_id!=='sgc-psi')throw Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON para sgc-psi');admin.initializeApp({credential:admin.credential.cert(secret)})}return admin.firestore()}
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Método no permitido'});
 try{
  const db=database(),data=JSON.parse(event.body||'{}'),id=String(data.id||''),delegated=typeof data.delegateToken==='string';if(!/^[a-f0-9-]{36}$/.test(id))return reply(400,{error:'Registro inválido'});
  let session={uid:'DELEGADO'};if(!delegated){const token=(event.headers.authorization||event.headers.Authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)return reply(401,{error:'Sesión requerida'});session=await admin.auth().verifyIdToken(token,true);const operator=await db.doc(`users/${session.uid}`).get();if(!operator.exists||operator.data().active!==true||!['ADMIN','CALIDAD'].includes(operator.data().role))return reply(403,{error:'Acceso no autorizado'});}
  const ref=db.doc(`sgcSkills1519/${id}`),current=await ref.get();if(!current.exists)return reply(404,{error:'Guarde primero'});
  const signerId=current.data().evaluatorId,identity=String(data.identity||'').trim(),pin=String(data.pin||'');if(!/^[0-9]{4}$/.test(pin)||!signerId||signerId===current.data().personId)return reply(400,{error:'Evaluador o PIN inválido'});
  const signer=await db.doc(`sgcPersonnel/${signerId}`).get();if(!signer.exists||signer.data().active===false||String(signer.data().identity||'').trim()!==identity)return reply(400,{error:'Identidad del evaluador incorrecta'});
  const credentialRef=db.doc(`sgcSignatureCredentials/${signerId}`);let invalid=false,result=null,pinState=null;
  const state=c=>({enabled:!!c?.enabled,remainingAttempts:c?.lockedUntil?.toMillis()>Date.now()?0:Math.max(0,5-(c?.failed||0)),retryAfterMs:Math.max(0,(c?.lockedUntil?.toMillis()||0)-Date.now())});

  await db.runTransaction(async tx=>{
   invalid=false;result=null;pinState=null;
   const [profile,credential]=await Promise.all([tx.get(ref),tx.get(credentialRef)]);
   if(delegated){const l=(await tx.get(db.doc(`sgcSkillsDelegations/${id}`))).data();if(!l||l.expires<Date.now()||l.evaluatorId!==signerId||l.hash!==createHash('sha256').update(data.delegateToken).digest('hex')||data.revision!==profile.updateTime.toMillis())throw Error('Enlace inválido o registro actualizado');}
   const p=profile.data();if(!p||p.status!=='BORRADOR'||p.approval||p.evaluatorId!==signerId)throw Error('Registro modificado o firmado');
   const origin=await tx.get(db.doc(`sgcPositionProfiles/${p.profileId}`));const f=origin.data();if(!f||f.status!=='APROBADO'||!f.approval||f.revision!==p.profileRevision||f.skills!==p.sourceSkills)throw Error('El perfil de origen cambió');
   const expected=String(f.skills).split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);if(!Array.isArray(p.skills)||JSON.stringify(p.skills.map(h=>h.name))!==JSON.stringify(expected)||!p.conclusion?.trim())throw Error('Criterios incompletos');
   let total=0,weight=0,weighted=0;for(const h of p.skills){const w=Number(h.weight);if(!Number.isFinite(w)||w<0||w>100)throw Error('Peso inválido');total+=w;if(h.na){if(!h.reason?.trim()||h.critical)throw Error('Justifique No aplica y revise criticidad');continue}if(!Array.isArray(h.questions)||!h.questions.length)throw Error('Criterios pendientes');const qs=h.questions.filter(q=>q.note!=='NA');if(!qs.length||h.questions.some(q=>!q.text?.trim()||(q.note==='NA'?!q.reason?.trim():!['1','2','3','4','5'].includes(String(q.note)))))throw Error('Calificación pendiente');if(h.critical&&!(Number(h.min)>=1&&Number(h.min)<=5))throw Error('Mínimo crítico inválido');weight+=w;weighted+=w*qs.reduce((a,q)=>a+Number(q.note),0)/qs.length;}if(Math.abs(total-100)>0.001||!weight)throw Error('Ponderación inválida');
   const c=credential.data();if(!c?.enabled)throw Error('El aprobador no tiene PIN configurado');if(c.lockedUntil?.toMillis()>Date.now()){pinState=state(c);invalid=true;return}
   const a=Buffer.from(pbkdf2Sync(pin,c.salt,210000,32,'sha256')),b=Buffer.from(c.hash,'hex');
   if(a.length!==b.length||!timingSafeEqual(a,b)){const failed=(c.failed||0)+1;tx.update(credentialRef,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});pinState={enabled:true,remainingAttempts:failed>=5?0:5-failed,retryAfterMs:failed>=5?900000:0};invalid=true;return}
   const signature={recordId:randomUUID(),signerId,signerName:signer.data().name,signerPosition:signer.data().position,formatCode:'PSI-MC1519',formatVersion:'02',method:delegated?'CEDULA_PIN_DELEGADO':'CEDULA_PIN_PRESENCIAL',operatorUid:delegated?'DELEGADO:'+signerId:session.uid};
   signature.sha256=createHash('sha256').update(JSON.stringify({id,signature,p})).digest('hex');
   tx.update(credentialRef,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});
   tx.update(ref,{status:'FIRMADO',approval:{...signature,signedAt:admin.firestore.FieldValue.serverTimestamp()},result:weighted/weight});
   result=signature;
  });
  if(invalid)return reply(pinState?.retryAfterMs?429:401,{...pinState,error:pinState?.retryAfterMs?'PIN bloqueado temporalmente':'PIN incorrecto. Intentos restantes: '+pinState?.remainingAttempts});
  const saved=await ref.get();return reply(200,{ok:true,approval:{...result,signedAt:saved.data().approval.signedAt.toDate().toISOString()},status:'FIRMADO'});
 }catch(e){console.error('Firma MC1519:',e.message);return reply(400,{error:e.message||'No se pudo registrar la aprobación'})}
}
