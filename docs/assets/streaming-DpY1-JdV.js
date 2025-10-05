function l(n){const r=[],s=n.split(`
`);let e={};for(const t of s)if(t.startsWith("event:"))e.event=t.substring(6).trim();else if(t.startsWith("data:"))e.data=t.substring(5).trim();else if(t===""&&e.event&&e.data){try{const a=JSON.parse(e.data);r.push({event:e.event,data:a})}catch(a){console.error("Failed to parse SSE data:",e.data,a)}e={}}return r}async function h(n,r,s,e){if(!n.body)throw new Error("Response body is null");const t=n.body.getReader(),a=new TextDecoder;let o="";try{for(;;){const{done:i,value:v}=await t.read();if(i){o.trim()&&l(o).forEach(d=>r(d.event,d.data)),s&&s();break}o+=a.decode(v,{stream:!0});const f=o.split(`

`);o=f.pop()||"";for(const c of f)c.trim()&&l(c+`

`).forEach(u=>r(u.event,u.data))}}catch(i){console.error("SSE stream error:",i),e&&e(i instanceof Error?i:new Error("Stream error"))}}async function p(n,r,s,e){const t=await fetch(n,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`,Accept:"text/event-stream"},body:JSON.stringify(r),signal:e});if(!t.ok)throw new Error(`Request failed: ${t.status} ${t.statusText}`);return t}export{p as createSSERequest,h as handleSSEResponse};
