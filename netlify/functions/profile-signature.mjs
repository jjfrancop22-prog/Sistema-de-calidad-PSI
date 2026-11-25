import admin from 'firebase-admin';
import {pbkdf2Sync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
function database(){if(!admin.apps.length){const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(!secret||secret.project_id!=='sgc-psi')throw Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON para sgc-psi');admin.initializeApp({credential:admin.credential.cert(secret)})}return admin.firestore()}
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Método no permitido'});
 try{
  const db=database(),token=(event.headers.authorization||event.headers.Authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)return reply(401,{error:'Sesión requerida'});
  const session=await admin.auth().verifyIdToken(token,true),operator=await db.doc(`users/${session.uid}`).get();
  if(!operator.exists||operator.data().active!==true||!['ADMIN','CALIDAD'].includes(operator.data().role))return reply(403,{error:'Acceso no autorizado'});
  const data=JSON.parse(event.body||'{}'),profileId=String(data.profileId||'');if(!/^[a-z0-9-]{1,110}$/.test(profileId))return reply(400,{error:'Identificador de perfil inválido'});
  const ref=db.doc(`sgcPositionProfiles/${profileId}`),current=await ref.get();if(!current.exists)return reply(404,{error:'Primero guarde el perfil'});
  if(data.action==='records')return reply(200,{ok:true,approval:current.data().approval||null,status:current.data().status});
  if(data.action!=='sign')return reply(400,{error:'Acción inválida'});
  const signerId=String(data.signerId||''),identity=String(data.identity||'').trim(),pin=String(data.pin||'');
  if(!/^[\w-]{1,128}$/.test(signerId)||!/^[0-9]{4}$/.test(pin)||data.accepted!==true)return reply(400,{error:'Seleccione al aprobador e ingrese cédula, PIN y aceptación'});
  const signer=await db.doc(`sgcPersonnel/${signerId}`).get();if(!signer.exists||signer.data().active===false)return reply(404,{error:'Aprobador no activo'});
  if(String(signer.data().identity||'').trim()!==identity)return reply(400,{error:'Cédula incorrecta'});
  const position=String(signer.data().position||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!/(gerente|president|representante legal)/.test(position))return reply(403,{error:'La aprobación del perfil requiere un cargo de Gerencia, Presidencia o Representación Legal'});
  const credentialRef=db.doc(`sgcSignatureCredentials/${signerId}`);let invalid=false,result=null;
  await db.runTransaction(async tx=>{
   invalid=false;result=null;
   const [profile,credential]=await Promise.all([tx.get(ref),tx.get(credentialRef)]);
   const p=profile.data();if(!p||p.status!=='BORRADOR'||p.approval)throw Error('Este perfil ya está aprobado o no admite firma');
   if(data.revision!==p.revision)throw Error('La revisión cambió. Cierre y vuelva a consultar el perfil antes de firmar');
   const missing=['purpose','education','training','knowledge','skills','experience'].filter(k=>typeof p[k]!=='string'||!p[k].trim());
   if(missing.length){const labels={purpose:'Propósito',education:'Educación',training:'Formación',knowledge:'Conocimientos técnicos',skills:'Habilidades',experience:'Experiencia'};throw Error('Complete y guarde: '+missing.map(k=>labels[k]).join(', '))}
   const c=credential.data();if(!c?.enabled)throw Error('El aprobador no tiene PIN configurado');if(c.lockedUntil?.toMillis()>Date.now())throw Error('PIN bloqueado temporalmente');
   const a=Buffer.from(pbkdf2Sync(pin,c.salt,210000,32,'sha256')),b=Buffer.from(c.hash,'hex');
   if(a.length!==b.length||!timingSafeEqual(a,b)){const failed=(c.failed||0)+1;tx.update(credentialRef,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});invalid=true;return}
   const signature={recordId:randomUUID(),signerId,signerName:signer.data().name,signerPosition:signer.data().position,identityLast4:identity.slice(-4),revision:p.revision,formatCode:'PSI-MC1507',formatVersion:'04',method:'CEDULA_PIN_PRESENCIAL',operatorUid:session.uid};
   signature.sha256=createHash('sha256').update(JSON.stringify({profileId,signature,profile:{position:p.position,purpose:p.purpose,education:p.education,training:p.training,knowledge:p.knowledge,skills:p.skills,experience:p.experience}})).digest('hex');
   tx.update(credentialRef,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});
   tx.update(ref,{status:'APROBADO',approval:{...signature,signedAt:admin.firestore.FieldValue.serverTimestamp()},approvedAt:admin.firestore.FieldValue.serverTimestamp(),effectiveDate:p.effectiveDate||new Date().toISOString().slice(0,10)});
   result=signature;
  });
  if(invalid)return reply(401,{error:'PIN incorrecto. Tras cinco intentos se bloquea 15 minutos'});
  const saved=await ref.get();return reply(200,{ok:true,approval:{...result,signedAt:saved.data().approval.signedAt.toDate().toISOString()},status:'APROBADO',effectiveDate:saved.data().effectiveDate});
 }catch(e){console.error('Firma MC1507:',e.message);return reply(400,{error:e.message||'No se pudo registrar la aprobación'})}
}
