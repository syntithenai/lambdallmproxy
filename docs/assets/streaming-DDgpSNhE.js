function l(n){const t=[],s=n.split(`
`);let e={};for(const r of s)if(r.startsWith("event:"))e.event=r.substring(6).trim();else if(r.startsWith("data:"))e.data=r.substring(5).trim();else if(r===""&&e.event&&e.data){try{const a=JSON.parse(e.data);t.push({event:e.event,data:a})}catch(a){console.error("Failed to parse SSE data:",e.data,a)}e={}}return t}async function h(n,t,s,e){if(!n.body)throw new Error("Response body is null");const r=n.body.getReader(),a=new TextDecoder;let o="";try{for(;;){const{done:i,value:v}=await r.read();if(i){o.trim()&&l(o).forEach(d=>t(d.event,d.data)),s&&s();break}o+=a.decode(v,{stream:!0});const f=o.split(`

`);o=f.pop()||"";for(const c of f)c.trim()&&l(c+`

`).forEach(u=>t(u.event,u.data))}}catch(i){console.error("SSE stream error:",i),e&&e(i instanceof Error?i:new Error("Stream error"))}}async function p(n,t,s){const e=await fetch(n,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`,Accept:"text/event-stream"},body:JSON.stringify(t)});if(!e.ok)throw new Error(`Request failed: ${e.status} ${e.statusText}`);return e}export{p as createSSERequest,h as handleSSEResponse};
