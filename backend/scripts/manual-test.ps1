# Manual end-to-end test: upload -> analyze -> approve -> rewrite -> export
# Requires: n8n running (both workflows active), backend running (npm run dev).
# Usage:  .\manual-test.ps1  [-BaseUrl http://localhost:3001] [-CvPdf path\to\cv.pdf]
# Output: prints the id of each step; export files land in ./test-output/

param(
  [string]$BaseUrl = 'http://localhost:3001',
  [string]$CvPdf = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($CvPdf)) {
  $repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $fixture = Join-Path $repoRoot 'project-context\cv-test'
  $pdf = Get-ChildItem -Path $fixture -Filter '*.pdf' | Select-Object -First 1
  if ($null -eq $pdf) { throw 'Tidak ada PDF fixture. Berikan -CvPdf <path>.' }
  $CvPdf = $pdf.FullName
}
if (-not (Test-Path -LiteralPath $CvPdf)) { throw "PDF tidak ditemukan: $CvPdf" }

$jobDesc = 'Backend Engineer dengan Node.js, TypeScript, dan SQL untuk tim berukuran sedang.'

function Invoke-Json {
  param([string]$Method, [string]$Url, [string]$Body = '')
  if ($Body -eq '') {
    $out = & curl.exe -s -X $Method $Url -H 'Accept: application/json' 2>$null
  } else {
    $bodyFile = Join-Path $env:TEMP ("cv-ats-body-{0}.json" -f [Guid]::NewGuid().ToString('N'))
    Set-Content -LiteralPath $bodyFile -Value $Body -Encoding utf8
    try {
      $out = & curl.exe -s -X $Method $Url -H 'Accept: application/json' -H 'Content-Type: application/json' --data-binary "@$bodyFile" 2>$null
    } finally {
      Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
  }
  $joined = ($out -join '')
  if ([string]::IsNullOrWhiteSpace($joined)) { throw "Respons kosong dari $Method $Url" }
  return $joined | ConvertFrom-Json
}

Write-Host "== 1/5 Upload CV: $CvPdf" -ForegroundColor Cyan
$out = & curl.exe -s -X POST "$BaseUrl/api/cvs" `
  -H 'Accept: application/json' `
  -F "cv=@$CvPdf;type=application/pdf" `
  -F "targetJobTitle=Backend Engineer" `
  -F "targetJobDescription=$jobDesc" 2>$null
$upload = ($out -join '') | ConvertFrom-Json
if ($null -eq $upload.id) { throw "Upload gagal: $($out -join '')" }
Write-Host "  cvId = $($upload.id)" -ForegroundColor Green

$cvId = $upload.id

Write-Host '== 2/5 Analyze (model free, bisa 1-5 menit) ...' -ForegroundColor Cyan
Write-Host '  Mohon tunggu, jangan tutup terminal.' -ForegroundColor Yellow
$report = Invoke-Json -Method 'POST' -Url "$BaseUrl/api/cvs/$cvId/analyze"
Write-Host "  reviewId = $($report.id) | overallScore = $($report.overallScore)" -ForegroundColor Green
$reviewId = $report.id

$suggestionIds = @($report.suggestions | ForEach-Object { $_.id } | Select-Object -First 3)
if ($suggestionIds.Count -eq 0) { throw 'Tidak ada suggestions dari analyze.' }
Write-Host "  suggestions dipilih: $($suggestionIds -join ', ')" -ForegroundColor Gray

Write-Host '== 3/5 Approve suggestions' -ForegroundColor Cyan
$body = @{ approvedSuggestionIds = $suggestionIds } | ConvertTo-Json -Compress
$approval = Invoke-Json -Method 'POST' -Url "$BaseUrl/api/reviews/$reviewId/approve" -Body $body
Write-Host "  approvalId = $($approval.id)" -ForegroundColor Green
$approvalId = $approval.id

Write-Host '== 4/5 Rewrite + post-check (1-5 menit) ...' -ForegroundColor Cyan
Write-Host '  Mohon tunggu, jangan tutup terminal.' -ForegroundColor Yellow
$rewrite = Invoke-Json -Method 'POST' -Url "$BaseUrl/api/approvals/$approvalId/rewrite"
Write-Host "  rewriteId = $($rewrite.id) | postScore = $($rewrite.postScore)" -ForegroundColor Green
$rewriteId = $rewrite.id

Write-Host '== 5/5 Export PDF & DOCX' -ForegroundColor Cyan
$outDir = Join-Path $PSScriptRoot 'test-output'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$pdfPath = Join-Path $outDir "rewrite-$rewriteId.pdf"
$docxPath = Join-Path $outDir "rewrite-$rewriteId.docx"
& curl.exe -s -o $pdfPath "$BaseUrl/api/rewrites/$rewriteId/export?format=pdf"
& curl.exe -s -o $docxPath "$BaseUrl/api/rewrites/$rewriteId/export?format=docx"

function Assert-ValidExport {
  param([string]$Path, [string]$Format, [byte[]]$MagicBytes)
  if (-not (Test-Path -LiteralPath $Path)) { throw "File ekspor tidak dibuat: $Path" }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt $MagicBytes.Length) { throw "File ekspor $Format terlalu kecil ($($bytes.Length) bytes) — kemungkinan respons error." }
  $head = $bytes[0..($MagicBytes.Length - 1)]
  for ($i = 0; $i -lt $MagicBytes.Length; $i++) {
    if ($head[$i] -ne $MagicBytes[$i]) { throw "File ekspor $Format tidak valid (signature salah): $Path" }
  }
}

Assert-ValidExport -Path $pdfPath -Format 'PDF' -MagicBytes ([byte[]](0x25, 0x50, 0x44, 0x46))
Assert-ValidExport -Path $docxPath -Format 'DOCX' -MagicBytes ([byte[]](0x50, 0x4B, 0x03, 0x04))
Write-Host "  PDF:  $pdfPath  ($((Get-Item $pdfPath).Length) bytes)" -ForegroundColor Green
Write-Host "  DOCX: $docxPath  ($((Get-Item $docxPath).Length) bytes)" -ForegroundColor Green

Write-Host ''
Write-Host 'SELESAI — semua langkah berhasil.' -ForegroundColor Cyan
Write-Host "Ringkasan: cvId=$cvId reviewId=$reviewId approvalId=$approvalId rewriteId=$rewriteId"
