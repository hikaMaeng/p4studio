import os
import struct
import subprocess

plan = b'--model /home/m42/p4-runs/models/MiMo-V2.6-Flash-RL-GGUF/MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf --memory-topology host-shared:0 --layer-begin 22 --layer-end 48 --n-seq-max 20 --ctx-size 150000 --kv-unified --spec-type draft-dflash'
env = os.environ.copy()
env['LD_LIBRARY_PATH'] = '/home/m42/p4-agent-current'
result = subprocess.run(
    ['/home/m42/p4-agent-current/p4_staged_server', '--port', '24891'],
    env=env,
    input=struct.pack('<I', len(plan)) + plan,
    capture_output=True,
    timeout=20,
)
print(result.stdout.decode())
print(result.stderr.decode())
print('exit=', result.returncode)
