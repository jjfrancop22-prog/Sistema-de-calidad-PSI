import React,{useState} from 'react';
import Impartiality411 from './impartiality411.jsx';
const points=[
 ['4.1.1','Imparcialidad','Actividades del laboratorio realizadas de forma imparcial y gestionadas para salvaguardar la imparcialidad.'],
 ['4.1.2','Compromiso de la dirección','Compromiso de la dirección del laboratorio con la imparcialidad.'],
 ['4.1.3','Responsabilidad y presiones','Responsabilidad sobre la imparcialidad y prevención de presiones comerciales, financieras u otras.'],
 ['4.1.4','Identificación de riesgos','Identificación continua de riesgos a la imparcialidad, incluidos los derivados de relaciones y actividades.'],
 ['4.1.5','Tratamiento de riesgos','Demostración de cómo se eliminan o minimizan los riesgos identificados.']
];
export default function Impartiality({libraryLinked=[],onLibrary,onLink,canEdit=false,user}){
 const [active,setActive]=useState('4.1.1');const [search,setSearch]=useState('');const current=points.find(p=>p[0]===active);
 const linked=libraryLinked.filter(x=>[x.code,x.title,x.type].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <div className="psi41Shell">
  <header className="psi41Header"><div><div className="psi41Eyebrow">ISO/IEC 17025 · REQUISITOS GENERALES</div><h2>4.1 · Gestión de la imparcialidad</h2><p>Gestión por requisito · Documentación y responsables vinculados</p></div><div className="psi41Actions"><button className="outline" onClick={onLibrary}>▤ Biblioteca</button><button onClick={()=>onLink?.('4.1','4.1 · Imparcialidad')}>♧ Responsables</button></div></header>
  <div className="psi41Summary"><div><strong>5</strong><span>Subnumerales</span></div><div><strong>{libraryLinked.length}</strong><span>Documentos vinculados</span></div><div><strong>—</strong><span>Evaluaciones registradas</span></div></div>
  <nav className="psi41Tabs" aria-label="Subnumerales de imparcialidad">{points.map(([id,title])=><button key={id} className={active===id?'selected':''} onClick={()=>setActive(id)} aria-current={active===id?'page':undefined}><b>{id}</b><span>{title}</span></button>)}</nav>
  <section className="psi41Workspace"><div className="psi41SectionHead"><div><span className="psi41Label">REQUISITO {current[0]}</span><h3>{current[1]}</h3><p>{current[2]}</p></div><span className="psi41Pending">Por configurar</span></div>
   {active==='4.1.1'&&<Impartiality411 user={user} canEdit={canEdit} onLibrary={onLibrary}/>}
   {active!=='4.1.1'&&<div className="psi41Panels"><div className="psi41Panel"><div className="psi41PanelHead"><h4>Gestión y evidencias</h4><span className="psi41MiniTag">{current[0]}</span></div><div className="psi41Empty"><strong>Espacio preparado</strong><p>Aquí se incorporarán los criterios, evaluaciones y evidencias de este subnumeral, de forma progresiva y con trazabilidad.</p></div></div>
   <div className="psi41Panel"><div className="psi41PanelHead"><h4>Responsables y vínculos</h4><button className="outline" onClick={()=>onLink?.(active,`${active} · ${current[1]}`)}>+ Vincular</button></div><p className="psi41Small">Utiliza el Maestro Único de Personal; una designación no acredita por sí sola conformidad.</p><div className="psi41Empty psi41EmptySmall">Sin asignaciones mostradas en esta vista.</div></div></div>}
  </section>
  <section className="psi41Documents"><div className="psi41PanelHead"><div><h4>Documentos de imparcialidad <span className="badge">{libraryLinked.length}</span></h4><p className="psi41Small">Catálogo transversal: los archivos se controlan en la Biblioteca y 8.3.</p></div><button className="outline" onClick={onLibrary}>Abrir centro documental ↗</button></div><input className="psi41Search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código o documento…" aria-label="Buscar documentos vinculados"/>
  {linked.length?linked.map(x=><div className="psi41DocRow" key={x.id}><div><strong>{x.code} · {x.title}</strong><small>{x.type||'Documento'} · V{x.version||'—'}</small></div><span className="psi41MiniTag">Vinculado a 4.1</span></div>):<div className="psi41Empty psi41EmptySmall">{search?'Sin coincidencias.':'Todavía no hay documentos vinculados.'}</div>}</section>
 </div>
}
