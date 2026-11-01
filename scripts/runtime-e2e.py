#!/usr/bin/env python3
"""Run the original empty-demo API and save a repeatable HTTP acceptance receipt."""
import json,os,pathlib,signal,socket,subprocess,tempfile,time,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
with tempfile.TemporaryDirectory(prefix='metadata-demo-') as td:
 env={**os.environ,'NODE_ENV':'development','METADATA_ENV':'development','INFISICAL_ENABLED':'0','DEV_TRUST_CLAIM':'0','STRIPE_ENABLED':'0','X402_ENABLED':'0','COMBO_FORWARD_ENABLED':'0','HOST':'127.0.0.1','PORT':str(port),'DATA_DIR':td,'TCG_CATALOG_DB':''}
 logfile=pathlib.Path(td)/'server.log'
 with logfile.open('w') as log:
  process=subprocess.Popen(['npm','run','start','-w','@metadata/server'],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:
   base='http://127.0.0.1:'+str(port)
   def get(path):
    with urllib.request.urlopen(base+path,timeout=5) as response:return response.status,json.load(response)
   for _ in range(120):
    if process.poll() is not None:raise RuntimeError('demo server exited: '+logfile.read_text()[-1800:])
    try:
     status,health=get('/v1/health')
     if status==200:break
    except Exception:time.sleep(.5)
   else:raise RuntimeError('demo API did not become ready: '+logfile.read_text()[-1800:])
   status,verticals=get('/v1/verticals');assert status==200
   entries=verticals if isinstance(verticals,list) else verticals.get('verticals',verticals.get('items',[]))
   assert len(entries)==16,verticals
   status,preview=get('/v1/preview');assert status==200
   status,liveness=get('/health');assert status==200
   report={'status':'passed','fixture':'original-empty-demo','verticals':len(entries),'checks':['API ready','all sixteen verticals discovered','anonymous preview response','liveness response'],'command':'npm run test:e2e','upstreamDataDownloaded':False}
   output=ROOT/'outputs/runtime-e2e.json';output.parent.mkdir(exist_ok=True);output.write_text(json.dumps(report,indent=2)+'\n');print(output.read_text())
  finally:
   try:os.killpg(process.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:process.wait(timeout=15)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
