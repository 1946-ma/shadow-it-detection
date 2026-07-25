<#
    support-ws-activity.ps1 — hands-free remote-access Shadow-IT traffic.

    Runs on the support-ws Windows VM. Every cycle it makes a few REAL HTTPS
    requests to remote-access vendors so the captured TLS ClientHello carries a
    genuine SNI the detector names (teamviewer.com / anydesk.com / ngrok.com),
    producing catalog detections without anyone touching the VM.

    This SUPPLEMENTS the real installed clients (which already beacon on their
    own); it just guarantees steady, observable traffic for a demo.

    One-time setup — register as a Scheduled Task that runs at logon:
      schtasks /Create /TN "bank-support-activity" /SC ONLOGON /RL LIMITED ^
        /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\bank-net\support-ws-activity.ps1"
    Remove after the demo:
      schtasks /Delete /TN "bank-support-activity" /F
#>

$targets = @(
    'https://www.teamviewer.com/',
    'https://anydesk.com/',
    'https://ngrok.com/'
)

# Loosen only for this process; these are real public HTTPS endpoints.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

while ($true) {
    $url = Get-Random -InputObject $targets
    try {
        Invoke-WebRequest -Uri $url -TimeoutSec 8 -UseBasicParsing -MaximumRedirection 2 | Out-Null
        Write-Host ("{0}  browse -> {1}" -f (Get-Date -Format HH:mm:ss), $url)
    } catch {
        # The SNI already left on the wire before any error — that's the point.
        Write-Host ("{0}  browse -> {1} (err)" -f (Get-Date -Format HH:mm:ss), $url)
    }
    Start-Sleep -Seconds (Get-Random -Minimum 20 -Maximum 60)
}
