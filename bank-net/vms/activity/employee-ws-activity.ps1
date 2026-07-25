<#
    employee-ws-activity.ps1 — hands-free unsanctioned-SaaS traffic.

    Runs on the employee-ws Windows VM. Every cycle it makes a few REAL HTTPS
    requests to unsanctioned cloud apps so the captured TLS ClientHello carries a
    genuine SNI the detector names (dropbox.com / chatgpt.com / mail.google.com /
    drive.google.com / wetransfer.com), producing catalog detections without
    anyone touching the VM.

    This SUPPLEMENTS the real Dropbox client (which already syncs/beacons); it
    just guarantees steady, observable traffic for a demo.

    One-time setup — register as a Scheduled Task that runs at logon:
      schtasks /Create /TN "bank-employee-activity" /SC ONLOGON /RL LIMITED ^
        /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\bank-net\employee-ws-activity.ps1"
    Remove after the demo:
      schtasks /Delete /TN "bank-employee-activity" /F
#>

$targets = @(
    'https://www.dropbox.com/',
    'https://chatgpt.com/',
    'https://mail.google.com/',
    'https://drive.google.com/',
    'https://wetransfer.com/'
)

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

while ($true) {
    $url = Get-Random -InputObject $targets
    try {
        Invoke-WebRequest -Uri $url -TimeoutSec 8 -UseBasicParsing -MaximumRedirection 2 | Out-Null
        Write-Host ("{0}  browse -> {1}" -f (Get-Date -Format HH:mm:ss), $url)
    } catch {
        Write-Host ("{0}  browse -> {1} (err)" -f (Get-Date -Format HH:mm:ss), $url)
    }
    Start-Sleep -Seconds (Get-Random -Minimum 20 -Maximum 60)
}
