import admin from 'firebase-admin';
import {pbkdf2Sync,timingSafeEqual,randomUUID,createHash} from 'node:crypto';
const reply=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
function database(){if(!admin.apps.length){const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(!secret||secret.project_id!=='sgc-psi')throw Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON para sgc-psi');admin.initializeApp({credential:admin.credential.cert(secret)})}return admin.firestore()}
export async function handler(event){
 if(event.httpMethod!=='POST')return reply(405,{error:'Método no permitido'});
 try{
  const db=database(),token=(event.headers.authorization||event.headers.Authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)return reply(401,{error:'Sesión requerida'});
  const session=await admin.auth().verifyIdToken(token,true),profile=await db.doc(`users/${session.uid}`).get();
  if(!profile.exists||profile.data().active!==true||!['ADMIN','CALIDAD'].includes(profile.data().role))return reply(403,{error:'Acceso no autorizado'});
  const data=JSON.parse(event.body||'{}'),processId=String(data.processId||''),personId=String(data.personId||'');
  if(!/^[\w-]{1,128}$/.test(processId)||!/^[\w-]{1,128}$/.test(personId))return reply(400,{error:'Identificadores inválidos'});
  const processRef=db.doc(`sgcSelectionProcesses/${processId}`),process=await processRef.get();
  if(!process.exists||process.data().status!=='FINALIZADO'||!process.data().selectedCandidateId||!process.data().decisionDate||!process.data().decisionNote)return reply(409,{error:'Finalice y guarde la decisión antes de firmar'});
  const person=await db.doc(`sgcPersonnel/${personId}`).get();if(!person.exists||person.data().active!==true)return reply(404,{error:'Responsable no activo'});
  const position=String(person.data().position||'');if(!/jefe|gerente|coordinador.*calidad/i.test(position))return reply(403,{error:'Seleccione un responsable con cargo autorizado'});
  const identity=String(data.identity||'').trim(),pin=String(data.pin||'');
  if(identity!==String(person.data().identity||'').trim()||!/^[0-9]{4}$/.test(pin))return reply(400,{error:'Cédula o PIN inválidos'});
  const library=await db.collection('sgcLibrary').where('code','==','PSI-MC1511').limit(20).get();
  if(!library.docs.some(d=>d.data().version==='02'&&d.data().approvalStatus==='APPROVED'&&d.data().fileStored===true))return reply(409,{error:'La plantilla PSI-MC1511 V02 debe estar aprobada y archivada'});
  const signatureRef=db.doc(`sgcSelectionSignatures/${processId}`),credentialRef=db.doc(`sgcSignatureCredentials/${personId}`);
  let result=null,invalid=false;
  await db.runTransaction(async tx=>{
   const [existing,credential,current]=await Promise.all([tx.get(signatureRef),tx.get(credentialRef),tx.get(processRef)]);
   if(existing.exists)throw Error('La decisión ya está firmada; no se permite sustituir la firma');
   if(current.data()?.status!=='FINALIZADO')throw Error('El proceso ya no está finalizado');
   const c=credential.data();if(!c?.enabled)throw Error('El responsable no tiene PIN configurado');
   if(c.lockedUntil?.toMillis()>Date.now())throw Error('PIN bloqueado temporalmente');
   const a=Buffer.from(pbkdf2Sync(pin,c.salt,210000,32,'sha256')),b=Buffer.from(c.hash,'hex');
   if(a.length!==b.length||!timingSafeEqual(a,b)){
    const failed=(c.failed||0)+1;tx.update(credentialRef,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});invalid=true;return;
   }
   const selected=current.data().candidates?.find(x=>x.id===current.data().selectedCandidateId);
   if(!selected)throw Error('Candidato seleccionado no encontrado');
   const payload={recordId:randomUUID(),processId,personId,personName:person.data().name,personPosition:position,identityLast4:identity.slice(-4),candidateId:selected.id,candidateName:selected.name,decisionDate:current.data().decisionDate,decisionNote:current.data().decisionNote,formatCode:'PSI-MC1511',formatVersion:'02',method:'CEDULA_PIN_PRESENCIAL',facilitatorUid:session.uid};
   const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
   tx.update(credentialRef,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});
   tx.create(signatureRef,{...payload,sha256,signedAt:admin.firestore.FieldValue.serverTimestamp()});result={...payload,sha256};
  });
  if(invalid)return reply(401,{error:'PIN incorrecto. Cinco intentos fallidos bloquean 15 minutos'});
  const saved=await signatureRef.get();return reply(200,{ok:true,record:{...result,signedAt:saved.data().signedAt.toDate().toISOString()}});
 }catch(e){console.error('Firma selección:',e.message);return reply(400,{error:e.message||'Error al firmar'})}
}
