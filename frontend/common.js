// Shared API base + fetch utilities for OSRS Hiscores frontend
(function(){
  const qApi = new URLSearchParams(location.search).get('api');
  if (qApi) localStorage.setItem('apiBaseOverride', qApi);
  let apiBase = (localStorage.getItem('apiBaseOverride') || document.documentElement.getAttribute('data-api-base') || location.origin).replace(/\/$/, '');

  function setApiBase(newBase){
    if(!newBase) return;
    apiBase = newBase.replace(/\/$/, '');
    localStorage.setItem('apiBaseOverride', apiBase);
    if (window.toast) try { toast('API base set to '+apiBase+' – reloading'); } catch(_){}
    setTimeout(()=>location.reload(),400);
  }
  function clearApiBase(){ localStorage.removeItem('apiBaseOverride'); if (window.toast) try { toast('API base override cleared – reloading'); } catch(_){} setTimeout(()=>location.reload(),400); }

  async function fetchJSON(path, init){
    const url = apiBase + path;
    const resp = await fetch(url, init);
    if (!resp.ok) throw new Error('Request failed: '+resp.status+' '+resp.statusText);
    const ct = resp.headers.get('content-type')||'';
    const body = await resp.text();
    try {
      if (!ct.includes('application/json')) {
        if (/^\s*</.test(body)) throw new Error('Received HTML instead of JSON from '+url+' (point frontend to Worker API).');
        throw new Error('Unexpected content-type ('+ct+') from '+url);
      }
      return JSON.parse(body);
    } catch(e){
      if (e instanceof SyntaxError) throw new Error('Invalid JSON from '+url+' – first chars: '+body.slice(0,60));
      throw e;
    }
  }

  // Expose
  window.API_BASE = apiBase;
  window.setApiBase = setApiBase;
  window.clearApiBase = clearApiBase;
  window.fetchJSON = fetchJSON;
})();
