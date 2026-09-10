from pathlib import Path

path = Path('server.js')
text = path.read_text(encoding='utf-8')

old_body = """async function readBody(req){
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>131072) throw new HttpError(413,'İstek çok büyük.');
  }
  if(!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400,'Geçersiz JSON gövdesi.'); }
}
function authorized(req){if(!APP_PIN)return true;return String(req.headers['x-app-pin']||'')===APP_PIN;}
"""
new_body = """async function readBody(req){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    bytes+=buffer.length;
    if(bytes>131072) throw new HttpError(413,'İstek çok büyük.');
    chunks.push(buffer);
  }
  if(bytes===0) return {};
  const raw=Buffer.concat(chunks,bytes).toString('utf8');
  try { return JSON.parse(raw); }
  catch { throw new HttpError(400,'Geçersiz JSON gövdesi.'); }
}
function requestUrl(req){
  const rawHost=req.headers.host;
  if(rawHost!=null){
    const host=String(rawHost).trim();
    if(!host) throw new HttpError(400,'Geçersiz Host başlığı.');
    try {
      const parsedHost=new URL(`http://${host}`);
      if(parsedHost.username||parsedHost.password||parsedHost.pathname!=='/'||parsedHost.search||parsedHost.hash)throw new Error('invalid host');
    } catch {
      throw new HttpError(400,'Geçersiz Host başlığı.');
    }
  }
  try { return new URL(req.url||'/','http://localhost'); }
  catch { throw new HttpError(400,'Geçersiz istek yolu.'); }
}
function authorized(req){if(!APP_PIN)return true;return String(req.headers['x-app-pin']||'')===APP_PIN;}
"""
if text.count(old_body) != 1:
    raise SystemExit(f'readBody guard mismatch: {text.count(old_body)}')
text = text.replace(old_body, new_body, 1)

old_server = """const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const method=req.method||'GET';
  try{
"""
new_server = """const server=http.createServer(async(req,res)=>{
  try{
    const url=requestUrl(req); const method=req.method||'GET';
"""
if text.count(old_server) != 1:
    raise SystemExit(f'server handler guard mismatch: {text.count(old_server)}')
text = text.replace(old_server, new_server, 1)

old_listen = """});
server.listen(PORT,'0.0.0.0',()=>console.log(`Halka Arz Portföyü: http://localhost:${PORT}`));
"""
new_listen = """});
server.headersTimeout=10_000;
server.requestTimeout=15_000;
server.keepAliveTimeout=5_000;
server.listen(PORT,'0.0.0.0',()=>console.log(`Halka Arz Portföyü: http://localhost:${PORT}`));
"""
if text.count(old_listen) != 1:
    raise SystemExit(f'listen guard mismatch: {text.count(old_listen)}')
text = text.replace(old_listen, new_listen, 1)

path.write_text(text, encoding='utf-8')
