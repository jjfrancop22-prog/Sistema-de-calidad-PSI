import {annualPdf} from './technical1506Pdf.js';
import React,{useState} from 'react';
import ControlledFormatPanel from './ControlledFormatPanel';
import {archiveGeneratedDocument} from './centerDocument';
import {libraryCodeId} from './library';
import {doc,getDoc} from 'firebase/firestore';
import {db} from './firebase';
const META={code:'PSI-MC1506',version:'06',title:'Evaluación técnica anual de analistas',type:'FORMATO',responsible:'Coordinador de Calidad',requirementIds:['6.2','6.2.5','8.3']};
const template=()=>annualPdf({person:{name:'Analista: __________________'},year:'____',techniques:[{id:'template',name:'Tecnica: __________________'}],plan:Array.from({length:8},(_,i)=>({t:{id:'template'},p:{id:String(i),name:' '},status:' '})),records:[],template:true});
export default function Technical1506Document({user,onLibrary}){const [busy,B]=useState(false),[msg,M]=useState('');async function archive(){B(true);try{const old=await getDoc(doc(db,'sgcLibrary',libraryCodeId(META.code)));if(old.exists()&&String(old.data().version)!=='06')throw Error('Existe otra edición; revise Biblioteca antes de archivar.');if(old.data()?.fileStored){M('Documento existente: consulte la edición en Biblioteca.');return}await archiveGeneratedDocument(META,new File([template()],'PSI-MC1506-06_PLANTILLA.pdf',{type:'application/pdf'}),user.uid);M('Plantilla registrada. Continúe revisión y aprobación en Biblioteca.');}catch(e){M(e.message)}finally{B(false)}}return <><ControlledFormatPanel {...META} description="Plantilla institucional única · Expedientes anuales independientes" status={msg||'Consulte el estado documental en Biblioteca'} busy={busy} onArchive={archive} onPreview={()=>window.open(URL.createObjectURL(template()),'_blank')} onLibrary={onLibrary}/></>}
