function l(a){const s=[],o=a.split(`
`);let e={};for(const t of o)if(t.startsWith("event:"))e.event=t.substring(6).trim();else if(t.startsWith("data:"))e.data=t.substring(5).trim();else if(t===""&&e.event&&e.data){try{const n=JSON.parse(e.data);s.push({event:e.event,data:n})}catch(n){console.error("Failed to parse SSE data:",e.data,n)}e={}}return s}async function h(a,s,o,e){if(!a.body)throw new Error("Response body is null");const t=a.body.getReader(),n=new TextDecoder;let r="";try{for(;;){const{done:i,value:v}=await t.read();if(i){r.trim()&&l(r).forEach(d=>s(d.event,d.data)),o&&o();break}r+=n.decode(v,{stream:!0});const f=r.split(`

`);r=f.pop()||"";for(const c of f)c.trim()&&l(c+`

`).forEach(u=>s(u.event,u.data))}}catch(i){console.error("SSE stream error:",i),e&&e(i instanceof Error?i:new Error("Stream error"))}}async function p(a,s,o,e,t){const n={"Content-Type":"application/json",Authorization:`Bearer ${o}`,Accept:"text/event-stream"};t&&(n["X-YouTube-Token"]=t);const r=await fetch(a,{method:"POST",headers:n,body:JSON.stringify(s),signal:e});if(!r.ok)throw new Error(`Request failed: ${r.status} ${r.statusText}`);return r}export{p as createSSERequest,h as handleSSEResponse};
