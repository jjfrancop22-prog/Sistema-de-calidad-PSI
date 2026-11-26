// One annual control per assigned parameter; rotate months deterministically.
export function annualPlan(techniques, assignments, records, year, personId, now){
 const offset=[...String(personId)].reduce((n,c)=>n+c.charCodeAt(0),0);
 let index=0;
 return techniques.flatMap(t=>t.parameters.filter(p=>assignments.find(a=>a.techniqueId===t.id)?.parameterIds.includes(p.id)).map(p=>{
 const month=(offset+index+++Number(year))%12+1;
 const due=`${year}-${String(month).padStart(2,'0')}`;
 const history=records.filter(r=>r.techniqueId===t.id&&r.parameterId===p.id&&r.date?.slice(0,4)===String(year)&&r.status==='CONFIRMADA').sort((a,b)=>b.date.localeCompare(a.date));
 const latest=history[0];
 return {t,p,month,due,latest,status:latest?(latest.result?.complies?'Cumple':'Reevaluar'):due<now.slice(0,7)?'Vencida':'Programada'};
 }));
}
