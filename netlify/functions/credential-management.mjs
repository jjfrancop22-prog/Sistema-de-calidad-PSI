import admin from 'firebase-admin';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Método no permitido'});
 try{
 if(!admin.apps.length){const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(secret?.project_id!=='sgc-psi')throw Error('Servicio no configurado');admin.initializeApp({credential:admin.credential.cert(secret)})}
 const token=(event.headers.authorization||event.headers.Authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)return reply(401,{error:'Sesión requerida'});
 const session=await admin.auth().verifyIdToken(token,true),db=admin.firestore(),operator=await db.doc(`users/${session.uid}`).get();if(operator.data()?.active!==true||operator.data()?.role!=='ADMIN')return reply(403,{error:'Solo ADMIN autorizado'});
 const d=JSON.parse(event.body||'{}');if(!/^[\w-]{1,128}$/.test(d.personId||''))return reply(400,{error:'Seleccione personal'});
 const personRef=db.doc(`sgcPersonnel/${d.personId}`),ref=db.doc(`sgcSignatureCredentials/${d.personId}`);
 const person=await personRef.get();if(person.data()?.active!==true)return reply(404,{error:'Personal no activo'});
 const identity=String(person.data().identity||'').trim();if(!identity)return reply(409,{error:'Identificación no registrada'});
 const duplicates=await db.collection('sgcPersonnel').where('identity','==',identity).limit(2).get();if(duplicates.size>1)return reply(409,{error:'Identificación duplicada en Maestro de Personal. Revise las fichas antes de continuar.'});
 if(d.action==='status'){const c=(await ref.get()).data();return reply(200,{ok:true,configured:!!c,enabled:c?.enabled===true,consistent:!c||(c.personId===d.personId&&typeof c.salt==='string'&&/^[a-f0-9]{64}$/i.test(c.hash||'')),retryAfterMs:Math.max(0,(c?.lockedUntil?.toMillis()||0)-Date.now()),remainingAttempts:c?.lockedUntil?.toMillis()>Date.now()?0:Math.max(0,5-(c?.failed||0)),lastReset:c?.resetAt?.toDate().toISOString()||null})}
 if(d.action!=='reset'||d.confirmed!==true||String(d.identity||'').trim()!==identity||!/^\d{4}$/.test(d.pin||'')||d.pin!==d.confirmPin||String(d.reason||'').trim().length<10||String(d.reason).length>500)return reply(400,{error:'Confirme identidad, presencia del titular, nuevo PIN y motivo (10–500 caracteres)'});
 if(!session.auth_time||Date.now()/1000-session.auth_time>300)return reply(403,{error:'Por seguridad, cierre sesión e ingrese nuevamente como ADMIN antes de restablecer (5 minutos).'});
 if(d.pin===identity.slice(-4)||/^(\d)\1{3}$/.test(d.pin)||['1234','4321','0123'].includes(d.pin))return reply(400,{error:'Seleccione un PIN no predecible, distinto de la identificación'});
 const salt=randomBytes(24).toString('hex'),hash=pbkdf2Sync(d.pin,salt,210000,32,'sha256').toString('hex'),stamp=admin.firestore.FieldValue.serverTimestamp();
 await db.runTransaction(async tx=>{const [p,c]=await Promise.all([tx.get(personRef),tx.get(ref)]);if(p.data()?.active!==true||String(p.data().identity||'').trim()!==identity)throw Error('Ficha modificada; consulte nuevamente');const audit=db.collection('sgcCredentialAudit').doc();tx.set(ref,{personId:d.personId,salt,hash,enabled:true,failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0),resetAt:stamp,resetBy:session.uid,...(!c.exists?{createdAt:stamp,createdBy:session.uid}:{})},{merge:true});tx.create(audit,{personId:d.personId,operatorUid:session.uid,reason:String(d.reason).trim(),action:c.exists?'RESET':'ENROLL',createdAt:stamp})});
 return reply(200,{ok:true,message:'Credencial actualizada. Las firmas anteriores se conservan.'});
 }catch(e){return reply(400,{error:e.message||'Error de gestión de credencial'})}
}
