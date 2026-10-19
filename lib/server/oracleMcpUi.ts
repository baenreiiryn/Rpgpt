export const ORACLE_UI_URI = "ui://oraclerpg/session-v1.html";
export const ORACLE_UI_MIME = "text/html;profile=mcp-app";

export const oracleAppHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>OracleRPG</title>
  <style>
    :root{color-scheme:dark;--bg:#07060c;--panel:#100d17;--line:#2d2338;--text:#f3ecdf;--muted:#92889d;--violet:#a97ce9;--gold:#ddbf7a;--green:#70c6a2}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:radial-gradient(circle at 20% 0,#181026 0,transparent 35%),var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,sans-serif}
    button,input{font:inherit}.app{min-height:100vh;display:grid;grid-template-rows:auto 1fr auto}.top{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);background:rgba(7,6,12,.92);position:sticky;top:0;z-index:5}.brand{display:flex;gap:9px;align-items:center;font-weight:800;letter-spacing:.14em}.sigil{width:29px;height:29px;border-radius:50%;border:1px solid #5a426c;display:grid;place-items:center;color:var(--gold)}.status{font-size:10px;color:var(--green)}
    .main{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:12px;padding:12px;min-height:0}.panel{border:1px solid var(--line);border-radius:16px;background:linear-gradient(145deg,rgba(17,14,25,.97),rgba(9,8,13,.97));overflow:hidden}.sceneHead{padding:14px 16px;border-bottom:1px solid var(--line)}.eyebrow{font-size:9px;color:var(--violet);letter-spacing:.16em;font-weight:800}.sceneHead h1{font:500 18px Georgia,serif;margin:5px 0}.messages{padding:18px;display:flex;flex-direction:column;gap:16px;overflow:auto;max-height:calc(100vh - 210px)}.msg{max-width:84%;display:grid;grid-template-columns:30px 1fr;gap:9px}.msg.player{align-self:flex-end;grid-template-columns:1fr 30px}.msg.player .avatar{grid-column:2}.msg.player .body{grid-column:1;grid-row:1;background:#1c1428;border:1px solid #30223f;border-radius:13px 4px 13px 13px;padding:10px 12px;text-align:right}.avatar{width:30px;height:30px;border:1px solid #3a2c48;border-radius:9px;display:grid;place-items:center;color:var(--gold);background:#17101f}.body small{font-size:8px;color:#8f829f;letter-spacing:.12em;font-weight:800}.body p{font:14px/1.6 Georgia,serif;margin:5px 0 0;white-space:pre-wrap}.side{padding:15px;overflow:auto}.char{padding-bottom:13px;border-bottom:1px solid var(--line)}.char h2{font:500 24px Georgia,serif;margin:4px 0}.char p{margin:0;color:var(--muted);font-size:11px}.resources{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:13px 0}.res{border:1px solid #2b2137;border-radius:10px;padding:9px;background:#0b0910}.res span{display:block;font-size:8px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}.res strong{font-size:16px}.res button{float:right;border:1px solid #3b2d48;background:#17101f;color:#c7b2d8;border-radius:6px;width:23px;height:23px;margin-left:3px;cursor:pointer}.section{font-size:9px;color:#aaa0b0;text-transform:uppercase;letter-spacing:.12em;margin:15px 0 7px}.row{border-top:1px solid #241c2e;padding:8px 0}.row strong{display:block;font-size:11px}.row small{color:var(--muted);font-size:9px}.composer{display:flex;gap:7px;padding:10px 12px;border-top:1px solid var(--line);background:rgba(7,6,12,.94);position:sticky;bottom:0}.composer input{flex:1;border:1px solid #342843;background:#0b0910;color:var(--text);border-radius:11px;padding:11px 12px;outline:none}.composer button,.imageBtn{border:0;border-radius:10px;background:linear-gradient(135deg,#875dc8,#5d3da1);color:white;padding:0 16px;cursor:pointer}.imageBtn{padding:8px 10px;margin-top:10px;font-size:10px}.empty{padding:35px;text-align:center;color:var(--muted)}
    @media(max-width:800px){.main{grid-template-columns:1fr}.side{display:none}.messages{max-height:none}.msg{max-width:95%}}
  </style>
</head>
<body>
  <div class="app">
    <header class="top"><div class="brand"><div class="sigil">◈</div><span>ORACLE <b style="color:var(--gold)">RPG</b></span></div><div id="status" class="status">conectando…</div></header>
    <main id="main" class="main"><section class="panel"><div class="empty">Carregando campanha…</div></section></main>
    <form id="composer" class="composer"><input id="input" autocomplete="off" placeholder="O que você faz?" /><button type="submit">Enviar</button></form>
  </div>
  <script>
    var state=null,busy=false;
    function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})}
    async function call(name,args){if(!window.openai||!window.openai.callTool)throw new Error("Host MCP Apps indisponível.");return window.openai.callTool(name,args||{})}
    function payload(result){if(result&&result.structuredContent)return result.structuredContent;if(result&&result.structured_content)return result.structured_content;return null}
    async function refresh(){try{var result=await call("get_campaign_state",{});var data=payload(result);if(data&&data.state)state=data.state;render();document.getElementById("status").textContent="● sincronizado"}catch(e){document.getElementById("status").textContent="erro de conexão";console.error(e)}}
    function resCard(label,key){var c=state.character,max=c["max"+key.charAt(0).toUpperCase()+key.slice(1)];return '<div class="res"><span>'+label+'</span><button data-adj="'+key+':1">+</button><button data-adj="'+key+':-1">−</button><strong>'+c[key]+'/'+max+'</strong></div>'}
    function render(){
      var main=document.getElementById("main");if(!state){main.innerHTML='<section class="panel"><div class="empty">Campanha não carregada.</div></section>';return}
      var msgs=(state.messages||[]).slice(-30).map(function(m){return '<article class="msg '+esc(m.role)+'"><div class="avatar">'+(m.role==="gm"?"◈":"F")+'</div><div class="body"><small>'+(m.role==="gm"?"ORACLE · MESTRE":m.role==="player"?esc(state.character.name):"SISTEMA")+'</small><p>'+esc(m.text)+'</p></div></article>'}).join("");
      var inv=(state.inventory||[]).map(function(i){return '<div class="row"><strong>'+esc(i.name)+' ×'+i.qty+'</strong><small>'+esc(i.detail)+'</small></div>'}).join("");
      var qs=(state.quests||[]).filter(function(q){return q.status==="active"}).map(function(q){return '<div class="row"><strong>'+esc(q.title)+'</strong><small>'+esc(q.stage)+'</small></div>'}).join("");
      main.innerHTML='<section class="panel"><div class="sceneHead"><div class="eyebrow">CENA ATUAL</div><h1>'+esc(state.campaign.scene)+'</h1><button id="image" class="imageBtn">✦ Gerar imagem da cena</button></div><div id="messages" class="messages">'+(msgs||'<div class="empty">A aventura ainda não começou.</div>')+'</div></section><aside class="panel side"><div class="char"><div class="eyebrow">PERSONAGEM</div><h2>'+esc(state.character.name)+'</h2><p>'+esc(state.character.archetype)+'</p></div><div class="resources">'+resCard("PV","hp")+resCard("Esperança","hope")+resCard("Estresse","stress")+resCard("Armadura","armor")+'</div><div class="section">Inventário</div>'+inv+'<div class="section">Missões</div>'+qs+'</aside>';
      document.querySelectorAll("[data-adj]").forEach(function(b){b.addEventListener("click",async function(){var p=b.dataset.adj.split(":");await call("character_adjust_resource",{resource:p[0],amount:Number(p[1])});await refresh()})});
      var image=document.getElementById("image");if(image)image.addEventListener("click",function(){if(window.openai&&window.openai.sendFollowUpMessage)window.openai.sendFollowUpMessage({prompt:"OracleRPG: gere uma imagem da cena atual usando sua ferramenta nativa de geração de imagens. Consulte primeiro o estado e as memórias visuais da campanha para manter os personagens consistentes.",scrollToBottom:false})});
      requestAnimationFrame(function(){var el=document.getElementById("messages");if(el)el.scrollTop=el.scrollHeight});
    }
    document.getElementById("composer").addEventListener("submit",async function(e){e.preventDefault();if(busy)return;var input=document.getElementById("input"),text=input.value.trim();if(!text)return;busy=true;input.value="";try{await call("append_message",{role:"player",text:text});await refresh();if(window.openai&&window.openai.sendFollowUpMessage)await window.openai.sendFollowUpMessage({prompt:"OracleRPG — ação do jogador: "+text,scrollToBottom:false})}finally{busy=false}});
    refresh();setInterval(refresh,2500);window.addEventListener("openai:set_globals",refresh);
  </script>
</body>
</html>`;
