import {mc0206Questions} from '../../src/conflictContent.js';
import admin from 'firebase-admin';
import {randomBytes,pbkdf2Sync,timingSafeEqual,createHash,randomUUID,createHmac} from 'node:crypto';
const res=(statusCode,data)=>({statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(data)});
const hash=(pin,salt)=>pbkdf2Sync(pin,salt,210000,32,'sha256').toString('hex');
function database(){if(!admin.apps.length){const secret=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');if(!secret||secret.project_id!=='sgc-psi')throw Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON para sgc-psi');admin.initializeApp({credential:admin.credential.cert(secret)})}return admin.firestore()}
export async function handler(event){
 if(event.httpMethod!=='POST')return res(405,{error:'Método no permitido'});
 try{
 const db=database(),data=JSON.parse(event.body||'{}'),{personId,action}=data;
 const remote=['remoteRead','remoteSign'].includes(action),token=(event.headers.authorization||event.headers.Authorization||'').match(/^Bearer (.+)$/)?.[1];
 let session=null;
 if(!remote){if(!token)return res(401,{error:'Sesión requerida'});session=await admin.auth().verifyIdToken(token,true);const profile=await db.doc(`users/${session.uid}`).get();if(!profile.exists||profile.data().active!==true||!['ADMIN','CALIDAD'].includes(profile.data().role))return res(403,{error:'Acceso no autorizado'});}
 if(!['PSI-MC0201','PSI-MC0203','PSI-MC0205','PSI-MC0206'].includes(data.documentCode)&&action!=='remoteRead'&&data.documentCode!=null)return res(400,{error:'Documento inválido'});
 if(!remote&&data.documentCode&&['PSI-MC0205','PSI-MC0206'].includes(data.documentCode))return res(400,{error:'Use el portal asignado'});
 const confidentiality=data.documentCode==='PSI-MC0203';
 const documentCode=data.documentCode||'PSI-MC0201';
 const versions={'PSI-MC0201':'06','PSI-MC0203':'03','PSI-MC0205':'03','PSI-MC0206':'04'},documentVersion=versions[documentCode];
 if(action==='overview'){
  const snapshot=await db.collection('sgcSignatureRecords').where('documentCode','==',documentCode).limit(1000).get();
  const records=snapshot.docs.map(d=>({...d.data(),signedAt:d.data().signedAt?.toDate?.().toISOString()||null})).filter(r=>r.documentVersion===documentVersion&&r.accepted===true);
  return res(200,{ok:true,records});
 }
if(typeof personId!=='string'||!/^[\w-]{1,128}$/.test(personId))return res(400,{error:'Identificador inválido'});
 const scope=String(data.scope||''),consultant=scope==='PSI-MC0205',year=Number(data.year||new Date().getFullYear());if(!Number.isInteger(year)||year<2026||year>new Date().getFullYear())return res(400,{error:'Año inválido'});const person=await db.doc(`${consultant?'sgcConsultants':'sgcPersonnel'}/${personId}`).get();if(!person.exists||person.data().active!==true)return res(404,{error:'Trabajador no activo'});

 const scopes=['PSI-MC0201','PSI-MC0203','both','all','PSI-MC0205','PSI-MC0206'];
 const linkRef=scopes.includes(scope)?db.doc(`sgcDeclarationLinks/${personId}_${scope}${['all','PSI-MC0206'].includes(scope)?'_'+year:''}`):null;
 const digest=v=>createHash('sha256').update(v).digest('hex');
 const derive=nonce=>createHmac('sha256',JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON).private_key).update(`declarations:${personId}:${scope}:${nonce}`).digest('hex');
 const allowed=scope==='all'?['PSI-MC0201','PSI-MC0203','PSI-MC0206']:scope==='both'?['PSI-MC0201','PSI-MC0203']:[scope];
 const validLink=l=>l&&l.expires>Date.now()&&typeof data.linkToken==='string'&&/^[a-f0-9]{64}$/.test(data.linkToken)&&l.hash===digest(data.linkToken);
 if(action==='consultantPin'){if(!consultant)return res(400,{error:'Alcance inválido'});const pin=String(data.newPin||'');if(!/^\d{4}$/.test(pin))return res(400,{error:'PIN de cuatro dígitos requerido'});const salt=randomBytes(24).toString('hex');await db.doc(`sgcConsultantCredentials/${personId}`).create({personId,salt,hash:hash(pin,salt),enabled:true,failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0),createdBy:session.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});return res(200,{ok:true});}
 if(['linkCreate','linkRevoke'].includes(action)){
  if(!linkRef)return res(400,{error:'Alcance inválido'});
  if(action==='linkRevoke'){await linkRef.delete();return res(200,{ok:true});}
  let output;await db.runTransaction(async tx=>{const l=(await tx.get(linkRef)).data();if(l?.nonce&&l.expires>Date.now()&&l.hash===digest(derive(l.nonce))){output={linkToken:derive(l.nonce),expires:l.expires};return;}const nonce=randomBytes(32).toString('hex'),linkToken=derive(nonce),expires=Date.now()+7*86400000;tx.set(linkRef,{nonce,hash:digest(linkToken),expires,createdBy:session.uid,createdAt:admin.firestore.FieldValue.serverTimestamp()});output={linkToken,expires};});return res(200,output);
 }
 if(remote&&(!linkRef||!validLink((await linkRef.get()).data())||(action==='remoteSign'&&!allowed.includes(documentCode))))return res(403,{error:'Enlace inválido, vencido o revocado'});
 if(action==='records'){
  const snapshot=await db.collection('sgcSignatureRecords').where('personId','==',personId).limit(100).get();
  const records=snapshot.docs.map(d=>({...d.data(),signedAt:d.data().signedAt?.toDate?.().toISOString()||null})).filter(r=>r.documentCode===documentCode&&r.documentVersion===documentVersion).sort((a,b)=>String(b.signedAt).localeCompare(String(a.signedAt)));
  return res(200,{ok:true,records});
 }
 const identity=String(data.identity||'').trim(),pin=String(data.pin||'').trim();if(!identity||identity!==String(person.data().identity||'').trim())return res(400,{error:'Cédula incorrecta'});
 if(!/^\d{4}$/.test(pin))return res(400,{error:'PIN de 4 números requerido'});
 const ref=db.doc(`${consultant?'sgcConsultantCredentials':'sgcSignatureCredentials'}/${personId}`);
 if(action==='enroll'){
  const salt=randomBytes(24).toString('hex'),digest=hash(pin,salt);
  await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists)throw Error('Ya existe PIN configurado. Solicite restablecimiento supervisado.');tx.create(ref,{personId,salt,hash:digest,enabled:true,failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0),createdAt:admin.firestore.FieldValue.serverTimestamp(),createdBy:session.uid})});
  return res(200,{ok:true,message:'PIN configurado correctamente'});
 }
 if(action==='remoteRead'){let out;await db.runTransaction(async tx=>{const l=(await tx.get(linkRef)).data(),c=(await tx.get(ref)).data();if(!validLink(l)||!c?.enabled||c.lockedUntil?.toMillis()>Date.now())throw Error('Acceso no disponible o bloqueado');const a=Buffer.from(hash(pin,c.salt),'hex'),b=Buffer.from(c.hash,'hex');if(a.length!==b.length||!timingSafeEqual(a,b)){const failed=(c.failed||0)+1;tx.update(ref,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});return;}const records=await tx.get(db.collection('sgcSignatureRecords').where('personId','==',personId));const extra=[];if(allowed.includes('PSI-MC0206')){const d=await tx.get(db.doc(`sgcConflictDeclarations/${year}_${personId}`));if(d.exists)extra.push({documentCode:'PSI-MC0206',answers:d.data().answers,recordId:d.id,sha256:d.data().sha256||'',method:d.data().method||'REGISTRO_INTERNO',signedAt:d.data().createdAt?.toDate?.().toISOString()});}if(consultant){const ds=await tx.get(db.collection('sgcConsultantDeclarations').where('personId','==',personId));for(const d of ds.docs)if(d.data().formatVersion==='03')extra.push({documentCode:'PSI-MC0205',conflict:d.data().conflict,detail:d.data().detail,recordId:d.id,sha256:d.data().sha256||'',method:d.data().method||'REGISTRO_INTERNO',signedAt:d.data().createdAt?.toDate?.().toISOString()});}out={person:{name:person.data().name,position:person.data().position||'',area:person.data().area||person.data().organization||''},records:[...extra,...records.docs.map(d=>d.data()).filter(r=>allowed.includes(r.documentCode)&&r.documentVersion===versions[r.documentCode]).map(r=>({...r,signedAt:r.signedAt?.toDate?.().toISOString()}))],allowed,year};tx.update(ref,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});});return out?res(200,out):res(401,{error:'PIN incorrecto'});}
 if(action!=='sign'&&action!=='remoteSign')return res(400,{error:'Acción desconocida'});
 if(remote&&['PSI-MC0205','PSI-MC0206'].includes(documentCode)){
 const isC=documentCode==='PSI-MC0205';if(data.accepted!==true)return res(400,{error:'Confirme la aceptación'});
 const answers=mc0206Questions.map((q,i)=>({title:q[0],answer:data.answers?.[i],detail:String(data.answerDetails?.[i]||'').trim().slice(0,700)}));
 const detail=String(data.details||'').trim().slice(0,800),conflict=data.conflict==='yes'?'SI':'NO';
 if(isC?(!['yes','none'].includes(data.conflict)||(conflict==='SI'&&!detail)):answers.some(a=>!['SI','NO'].includes(a.answer)||(a.answer==='SI'&&!a.detail)))return res(400,{error:'Complete las respuestas y detalles requeridos'});
 const docs=await db.collection('sgcLibrary').where('code','==',documentCode).limit(20).get();if(!docs.docs.some(d=>d.data().version===documentVersion&&d.data().approvalStatus==='APPROVED'&&d.data().fileStored===true))return res(409,{error:'Apruebe y archive el formato en Biblioteca'});
 const recordRef=db.doc(isC?`sgcConsultantDeclarations/${randomUUID()}`:`sgcConflictDeclarations/${year}_${personId}`),payload={personId,personName:person.data().name,formatCode:documentCode,formatVersion:documentVersion,accepted:true,createdBy:'PORTAL_INDIVIDUAL',method:'CEDULA_PIN_REMOTA',recordId:recordRef.id,...(isC?{identity:person.data().identity,position:person.data().position,organization:person.data().organization,conflict,detail,identityMatched:true,reviewStatus:conflict==='SI'?'PENDIENTE_EVALUACION':'SIN_CONFLICTO_DECLARADO'}:{year,answers,reviewStatus:answers.some(a=>a.answer==='SI')?'PENDIENTE_EVALUACION':'SIN_SITUACIONES_DECLARADAS',reviewedAt:null,reviewedBy:'',assessment:'',measures:''})};
 const sha256=digest(JSON.stringify(payload));let success=false;
 await db.runTransaction(async tx=>{success=false;const l=(await tx.get(linkRef)).data(),c=(await tx.get(ref)).data();if(!validLink(l)||!c?.enabled||c.lockedUntil?.toMillis()>Date.now())throw Error('Acceso no disponible o bloqueado');const old=isC?await tx.get(db.collection('sgcConsultantDeclarations').where('personId','==',personId)):await tx.get(recordRef);if(isC?old.docs.some(d=>d.data().formatVersion==='03'):old.exists)throw Error('Declaración ya registrada');const a=Buffer.from(hash(pin,c.salt),'hex'),b=Buffer.from(c.hash,'hex');if(a.length!==b.length||!timingSafeEqual(a,b)){const failed=(c.failed||0)+1;tx.update(ref,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});return;}tx.update(ref,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});tx.create(recordRef,{...payload,sha256,createdAt:admin.firestore.FieldValue.serverTimestamp()});success=true;});if(!success)return res(401,{error:'PIN incorrecto'});const saved=await recordRef.get();return res(200,{record:{...payload,documentCode,sha256,signedAt:saved.data().createdAt.toDate().toISOString()}});
 }
 const conflict=data.conflict,details=String(data.details||'').trim();if((!confidentiality&&(!['none','yes'].includes(conflict)||(conflict==='yes'&&(!details||details.length>2000)))||data.accepted!==true))return res(400,{error:'Complete la declaración y aceptación'});
 const docs=await db.collection('sgcLibrary').where('code','==',documentCode).limit(20).get();if(!docs.docs.some(d=>d.data().version===documentVersion&&d.data().approvalStatus==='APPROVED'&&d.data().fileStored===true))return res(409,{error:'Apruebe y archive '+documentCode+' V'+documentVersion+' en Biblioteca antes de firmar'});
 const existing=await db.collection('sgcSignatureRecords').where('personId','==',personId).limit(100).get();if(existing.docs.some(d=>d.data().documentCode===documentCode&&d.data().documentVersion===documentVersion))return res(409,{error:'Ya existe una aceptación de esta edición. Consulte el documento firmado en el expediente.'});
 const id=randomUUID(),recordRef=db.doc(`sgcSignatureRecords/${id}`),payload={recordId:id,personId,personName:person.data().name,identityLast4:identity.slice(-4),documentCode,documentVersion,requirementId:confidentiality?'4.2.4':'4.1.1',conflict:confidentiality?'':conflict,details:confidentiality?'':conflict==='yes'?details:'',accepted:true,method:remote?'CEDULA_PIN_REMOTA':'CEDULA_PIN_PRESENCIAL',facilitatorUid:session?.uid||'PORTAL_INDIVIDUAL'};
 const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 let success=false;
 await db.runTransaction(async tx=>{const snap=await tx.get(ref),c=snap.data();if(remote&&!validLink((await tx.get(linkRef)).data()))throw Error('Enlace vencido o revocado');const current=await tx.get(db.collection('sgcSignatureRecords').where('personId','==',personId));if(current.docs.some(d=>d.data().documentCode===documentCode&&d.data().documentVersion===documentVersion))throw Error('Documento ya firmado');success=false;if(!c?.enabled)throw Error('PIN no configurado');if(c.lockedUntil?.toMillis()>Date.now())throw Error('PIN bloqueado durante 15 minutos');const a=Buffer.from(hash(pin,c.salt),'hex'),b=Buffer.from(c.hash,'hex');if(a.length!==b.length||!timingSafeEqual(a,b)){const failed=(c.failed||0)+1;tx.update(ref,{failed:failed>=5?0:failed,lockedUntil:admin.firestore.Timestamp.fromMillis(failed>=5?Date.now()+900000:0)});return}tx.update(ref,{failed:0,lockedUntil:admin.firestore.Timestamp.fromMillis(0)});tx.create(recordRef,{...payload,sha256,signedAt:admin.firestore.FieldValue.serverTimestamp()});success=true});
 if(!success)return res(401,{error:'PIN incorrecto. Tras 5 intentos se bloquea 15 minutos.'});
 const saved=await recordRef.get();return res(200,{ok:true,record:{...payload,sha256,signedAt:saved.data().signedAt.toDate().toISOString()}});
 }catch(e){console.error('Firma:',e.message);return res(400,{error:e.message||'Error de firma'})}
}
