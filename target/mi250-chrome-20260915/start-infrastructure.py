from pathlib import Path
import subprocess, json, shlex, hashlib

root = Path(__file__).resolve().parent
owners = []
binary = Path('F:/dev/p4/target/cluster-envelope-20260915/runtime/p4-agent.exe')
with (root/'gateway.log').open('w') as stdout, (root/'gateway.err').open('w') as stderr:
    p = subprocess.Popen([str(binary), '0.0.0.0:42010', 'tcp://127.0.0.1:42010'], stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=subprocess.CREATE_NO_WINDOW)
owners.append(dict(name='gateway', pid=p.pid, binary=str(binary), sha256=hashlib.sha256(binary.read_bytes()).hexdigest()))
for name,user,sshport,port,peer in [('miA','banya',5122,42011,42012),('miB','banya2',5222,42012,42011)]:
    remote = f'/home/{user}/p4-envelope-dde0813fb-20260915'
    code = f'''from pathlib import Path
import subprocess,json,hashlib,os
root=Path({remote!r}); build=json.loads((root/'build-result.json').read_text()); binary=build['binary']
assert build['exit']==0 and hashlib.sha256(Path(binary).read_bytes()).hexdigest()==build['binary_sha256']
run=root/'studio-20260915';run.mkdir(exist_ok=True)
env=dict(os.environ);env['PATH']='/opt/rocm/bin:'+env.get('PATH','')
p=subprocess.Popen([binary,'127.0.0.1:{port}','tcp://127.0.0.1:{port}'],stdin=subprocess.DEVNULL,stdout=open(run/'agent.log','w'),stderr=open(run/'agent.err','w'),env=env)
owner={{'pid':p.pid,'binary':binary,'sha256':build['binary_sha256']}};(run/'owner.json').write_text(json.dumps(owner));print(json.dumps(owner),flush=True);p.wait()
'''
    args=['ssh','-J','hika@192.168.0.19','-p',str(sshport),'-i','F:/desktop/newtype/id_ed25519','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','IdentitiesOnly=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','-L',f'127.0.0.1:{port}:127.0.0.1:{port}','-R','127.0.0.1:42010:127.0.0.1:42010','-R',f'127.0.0.1:{peer}:127.0.0.1:{peer}',f'{user}@1.214.116.122','python3 -u -c '+shlex.quote(code)]
    with (root/f'{name}-ssh.log').open('w') as log:
        p=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
    owners.append(dict(name=name,pid=p.pid,command=args,remote=remote+'/studio-20260915'))
(root/'owners.json').write_text(json.dumps(owners,indent=2))
print(json.dumps([{'name':o['name'],'pid':o['pid']} for o in owners]))
