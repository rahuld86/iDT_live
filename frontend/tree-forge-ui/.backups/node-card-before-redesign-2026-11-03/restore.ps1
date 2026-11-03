$ErrorActionPreference = "Stop"
$frontendRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'DecisionTreeRenderer.tsx') -Destination (Join-Path $frontendRoot 'src/components/DecisionTreeRenderer.tsx')
Write-Output 'Restored the node renderer from before the card redesign.'
