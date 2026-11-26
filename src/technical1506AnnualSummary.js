export function annualSummary(plan, techniqueId){
 const rows=plan.filter(r=>r.t.id===techniqueId).map(r=>({parameterId:r.p.id,parameterName:r.p.name,scheme:r.p.scheme,status:r.status,evaluationId:r.latest?.id||'',date:r.latest?.date||'',score:r.latest?.result?.score??null}));
 const total=rows.length, evaluated=rows.filter(r=>r.evaluationId).length, conforming=rows.filter(r=>r.status==='Cumple').length, repeat=rows.filter(r=>r.status==='Reevaluar').length;
 return {rows,total,evaluated,conforming,repeat,pending:total-evaluated,ready:total>0&&conforming===total};
}
