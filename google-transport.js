export function googleOrigin(origin) {
  try { const url=new URL(origin);return url.protocol==='https:'&&(url.hostname==='script.google.com'||url.hostname==='script.googleusercontent.com'||url.hostname.endsWith('.script.googleusercontent.com')||/^n-[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname)); } catch {return false;}
}
export class GoogleTransport {
  constructor(url) {
    const endpoint=new URL(url);
    if(endpoint.origin!=='https://script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw Error('Configura la URL de Apps Script terminada en /exec.');
    this.channel=crypto.randomUUID();this.pending=new Map();this.source=null;this.origin=null;
    endpoint.searchParams.set('origin',location.origin);endpoint.searchParams.set('channel',this.channel);
    this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.timeout=setTimeout(()=>reject(Error('No conecta con Google. Revisa SITE_ORIGINS y la publicación con acceso para Cualquiera.')),25000);});
    this.listener=event=>{
      if(!googleOrigin(event.origin)||event.data?.channel!==this.channel)return;
      if(event.data.ready&&!this.source){this.source=event.source;this.origin=event.origin;clearTimeout(this.timeout);this.resolveReady();return;}
      if(event.source!==this.source||event.origin!==this.origin)return;
      const request=this.pending.get(event.data.id);if(!request)return;this.pending.delete(event.data.id);clearTimeout(request.timer);
      event.data.error?request.reject(Error(event.data.error)):request.resolve(event.data.data);
    };
    window.addEventListener('message',this.listener);
    this.frame=document.createElement('iframe');this.frame.hidden=true;this.frame.title='Conexión privada con el juego';this.frame.src=endpoint.href;document.body.append(this.frame);
  }
  async request(path,body,token) {
    await this.ready;const id=crypto.randomUUID();
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Google tardó demasiado. Revisa tu conexión antes de reenviar.'));},30000);this.pending.set(id,{resolve,reject,timer});this.source.postMessage({id,path,body,token,channel:this.channel},this.origin);});
  }
}
