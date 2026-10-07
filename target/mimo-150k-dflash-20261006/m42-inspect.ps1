param(
    [Parameter(Mandatory=$true)][int]$LayerBegin,
    [Parameter(Mandatory=$true)][int]$LayerEnd,
    [Parameter(Mandatory=$true)][int]$CpuExpertLayer,
    [Parameter(Mandatory=$true)][string]$GpuUuid
)
$model = 'D:\models\linker\MiMo-V2.6-Flash-RL-GGUF\MiMo-V2.6-Flash-RL-MXFP4-00001-of-00002.gguf'
$excluded = (0..47 | Where-Object { $_ -lt $LayerBegin -or $_ -ge $LayerEnd }) -join '|'
$plan = "--model `"$model`" --memory-topology discrete --layer-begin $LayerBegin --layer-end $LayerEnd --kv-layer-begin $LayerBegin --kv-layer-end $LayerEnd --n-seq-max 20 --ctx-size 150000 --kv-unified --kv-offload --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --device CUDA0 --n-gpu-layers 999 --fit off --no-mmap --threads 14 --threads-batch 14 --batch-size 128 --ubatch-size 64 --ctx-checkpoints 4 --no-host --no-repack --override-tensor `"blk\.($excluded)\..*=CPU`" --override-tensor `"blk\.$CpuExpertLayer\.ffn_(gate|up|down)_exps\.weight=CPU`" --expect-layer-device ${LayerBegin}:${LayerEnd}:CUDA0 --spec-type none --inspect-memory-plan"
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = 'D:\p4-runs\m42-gemma12b-20261003\bin\p4_staged_server.exe'
$info.WorkingDirectory = 'D:\p4-runs\m42-gemma12b-20261003\bin'
$info.Arguments = '--port 24891'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
$info.EnvironmentVariables['CUDA_VISIBLE_DEVICES'] = $GpuUuid
$info.EnvironmentVariables['CUDA_DEVICE_ORDER'] = 'PCI_BUS_ID'
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $info
[void]$proc.Start()
$stdoutTask = $proc.StandardOutput.ReadToEndAsync()
$stderrTask = $proc.StandardError.ReadToEndAsync()
$bytes = [Text.Encoding]::UTF8.GetBytes($plan)
$prefix = [BitConverter]::GetBytes([uint32]$bytes.Length)
$proc.StandardInput.BaseStream.Write($prefix, 0, 4)
$proc.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
$proc.StandardInput.Close()
if (-not $proc.WaitForExit(90000)) { $proc.Kill(); throw 'M42 native plan probe timed out' }
$output = $stdoutTask.Result + $stderrTask.Result + "`nexit=$($proc.ExitCode)"
$output | Set-Content -LiteralPath "D:\p4-runs\m42-gemma12b-20261003\$LayerBegin-$LayerEnd-memory-plan.log" -Encoding UTF8
$output -split "`n" | Where-Object { $_ -match 'MEMORY_PLAN|CAPABILITY|PLAN_APPLIED|failed|error|exit=' }
