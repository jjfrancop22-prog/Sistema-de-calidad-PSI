import admin from 'firebase-admin';
import {pbkdf2Sync,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
const roles=['Jefe inmediato','Jefe Administrativo','Coordinador de Calidad','Coordinador Técnico y SSO','Trabajador'];
function database(){if(!admin.apps.length){const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(!secret||secret.project_id!=='sgc-psi')throw Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON para sgc-psi');admin.initializeApp({credential:admin.credential.cert(secret)})}return admin.firestore()}
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Método no permitido'});
 try{
  const db=database(),token=(event.headers.authorization||event.headers.Authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)return reply(401,{error:'Sesión requerida'});
  const session=await admin.auth().verifyIdToken(token,true),profile=await db.doc(`users/${session.uid}`).get();if(!profile.exists||profile.data().active!==true||!['ADMIN','CALIDAD'].includes(profile.data().role))return reply(403,{error:'Acceso no autorizado'});
  const data=JSON.parse(event.body||'{}'),inducteeId=String(data.inducteeId||'');if(!/^[\w-]{1,128}$/.test(inducteeId))return reply(400,{error:'Trabajador inválido'});
  const inductionRef=db.doc(`sgcPersonnelInductions/${inducteeId}`),induction=await inductionRef.get();if(!induction.exists)return reply(404,{error:'Guarde la inducción antes de consultar o firmar'});
  if(data.action==='records'){
   const snaps=await db.collection('sgcInductionSignatures').where('inducteeId','==',inducteeId).limit(20).get();
   return reply(200,{ok:true,records:snaps.docs.map(s=>({...s.data(),signedAt:s.data().signedAt?.toDate?.().toISOString()||null}))});
  }
  if(data.action!=='sign')return reply(400,{error:'Acción inválida'});
  const role=String(data.role||''),signerId=String(data.signerId||''),identity=String(data.identity||'').trim(),pin=String(data.pin||'');
  if(!roles.includes(role)||!/^[\w-]{1,128}$/.test(signerId)||!/^\d{4}$/.test(pin)||data.accepted!==true)return reply(400,{error:'Complete el responsable, cédula, PIN y aceptación'});
  if(induction.data().status!=='TEMAS_COMPLETADOS')return reply(409,{error:'Complete y guarde temas y documentos antes de firmar'});
  const signer=await db.doc(`sgcPersonnel/${signerId}`).get();if(!signer.exists||signer.data().active===false)return reply(404,{error:'Responsable no activo'});
  if(String(signer.data().identity||'').trim()!==identity)return reply(400,{error:'Cédula incorrecta'});
  if(role==='Trabajador'&&signerId!==inducteeId)return reply(403,{error:'La constancia del trabajador debe firmarla el propio trabajador'});
  const position=String(signer.data().position||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(role==='Jefe Administrativo'&&!/jef[ea].*administrativ/.test(position))return reply(403,{error:'El firmante no ocupa el cargo de Jefe Administrativo'});
  if(role==='Coordinador de Calidad'&&!/coordinador.*calidad/.test(position))return reply(403,{error:'El firmante no ocupa el cargo de Coordinador de Calidad'});
  if(role==='Coordinador Técnico y SSO'&&!/coordinador.*(tecnic|sso)/.test(position))return reply(403,{error:'El firmante no ocupa el cargo de Coordinador Técnico y SSO'});
  if(role==='Jefe inmediato'&&!/jef|gerente|coordinador/.test(position))return reply(403,{error:'El jefe inmediato debe ocupar un cargo de jefatura o coordinación'});
  const ref=db.doc(`sgcInductionSignatures/${inducteeId}_${roles.indexOf(role)}`),credentialRef=db.doc(`sgcSignatureCredentials/${signerId}`);let result=null,invalid=false;
  await db.runTransaction(async tx=>{
   const [old,credential,current]=await Promise.all([tx.get(ref),tx.get(credentialRef),tx.get(inductionRef)]);
   if(old.exists)throw Error('Esta constancia ya fue firmada; no se puede reemplazar');
   if(current.data()?.status!=='TEMAS_COMPLETADOS')throw Error('La inducción ya no está completa');
   const c=credential.data();if(!c?.enabled)throw Error('El responsable no tiene PIN configurado');if(c.lockedUntil?.toMillis()>Date.now())throw Error('PIN bloqueado temporalmente');
   const a=Buffer.from(pbkdf2Sync(pin,c.salt,210000,32,'sha256')),b=Buffer.from(c.hash,'hex');
   if(a.length!==b.length||!timingSafeEqual(a,b)){const failed=(c.failed||0)+1;tx.update(credentialRef,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});invalid=true;return;}
   const payload={recordId:randomUUID(),inducteeId,role,signerId,signerName:signer.data().name,signerPosition:signer.data().position,identityLast4:identity.slice(-4),formatCode:'PSI-MC1509',formatVersion:'03',inductionDate:current.data().date,method:'CEDULA_PIN_PRESENCIAL',facilitatorUid:session.uid};
   const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');tx.update(credentialRef,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});tx.create(ref,{...payload,sha256,signedAt:admin.firestore.FieldValue.serverTimestamp()});tx.update(inductionRef,{signedCount:admin.firestore.FieldValue.increment(1)});result={...payload,sha256};
  });
  if(invalid)return reply(401,{error:'PIN incorrecto. Tras cinco intentos se bloquea 15 minutos'});
  const saved=await ref.get();return reply(200,{ok:true,record:{...result,signedAt:saved.data().signedAt.toDate().toISOString()}});
 }catch(e){console.error('Firma inducción:',e.message);return reply(400,{error:e.message||'Error de firma'})}
}
