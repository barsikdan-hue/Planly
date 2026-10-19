$ErrorActionPreference='Stop'
$root=$PSScriptRoot
function ReadJson([string]$p){Get-Content -LiteralPath (Join-Path $root $p) -Raw|ConvertFrom-Json}
function Sha([string]$p){(Get-FileHash -LiteralPath (Join-Path $root $p) -Algorithm SHA256).Hash.ToLowerInvariant()}
$checks=0
$failures=[Collections.Generic.List[string]]::new()
function Check([bool]$ok,[string]$name){$script:checks++;if(-not $ok){$script:failures.Add($name)}}
$manifest=ReadJson 'bundle-manifest.json'
foreach($file in $manifest.files){Check ((Sha $file.path) -eq $file.sha256) "file $($file.path)"}
$proof=ReadJson 'source-proof.json'
$snapshot=ReadJson 'snapshot.portable.json'
$ledger=ReadJson 'acceptance-ledger.json'
$facts=ReadJson 'reviews/factcheck-r1.json'
$critic=ReadJson 'reviews/critic-r1.json'
$api=ReadJson 'api-package.json'
$journal=ReadJson 'loading-journal-template.json'
Check ((Sha 'snapshot.portable.json') -eq $proof.portable_snapshot.sha256) 'portable snapshot hash'
Check ($ledger.original_reviewed_snapshot_sha256 -eq $proof.original_snapshot.sha256) 'original snapshot binding'
Check ($ledger.status -eq 'ACCEPTED_LOCAL' -and $ledger.counts.accepted_local -eq 3) 'local acceptance count'
foreach($r in $ledger.independent_review_reports){Check ((Sha $r.path) -eq $r.sha256) "review hash $($r.path)"}
foreach($review in @($facts,$critic)){Check ($review.input_digest -eq $proof.original_snapshot.sha256 -and $review.verdict -eq 'READY' -and $review.revision -eq 1) "review binding $($review.role)"}
foreach($copy in $proof.byte_identical_copies){Check ((Sha $copy.path) -eq $copy.original_document_sha256 -and $copy.original_document_sha256 -eq $copy.bundled_sha256) "unchanged copy $($copy.path)"}
Check ($journal.execution -eq 'NOT_RUN' -and $ledger.counts.imported -eq 0 -and $ledger.counts.published -eq 0) 'no import/publication claim'
Add-Type -AssemblyName System.Drawing
foreach($m in $snapshot.materials){
 $binding=$ledger.material_bindings|Where-Object material_id -eq $m.material_id
 $text=Get-Content -LiteralPath (Join-Path $root $binding.text_path) -Raw
 $item=$api.items|Where-Object material_id -eq $m.material_id
 Check ($text -ceq $m.text -and $text -ceq $item.library_create.body.text) "$($m.material_id) exact published text"
 Check ((Sha $binding.text_path) -eq $binding.text_sha256 -and $text.Length -eq $m.utf16_length -and $text.Length -ge 500 -and $text.Length -le 1024) "$($m.material_id) text hash and length"
 Check ($binding.revision -eq 1 -and $binding.verdict -eq 'ACCEPTED_LOCAL' -and $binding.schedule_eligibility -eq 'NOT_EVALUATED') "$($m.material_id) scope"
 Check ($item.creation_key -eq $m.library_creation_key -and $item.library_create.body.mediaIds.Count -eq 1) "$($m.material_id) loading identity"
 Check (@($facts.materials|Where-Object {$_.material_id -eq $m.material_id -and $_.revision -eq 1 -and $_.verdict -eq 'READY'}).Count -eq 1) "$($m.material_id) factual READY"
 Check (@($critic.materials|Where-Object {$_.material_id -eq $m.material_id -and $_.revision -eq 1 -and $_.verdict -eq 'READY'}).Count -eq 1) "$($m.material_id) critic READY"
 foreach($a in $m.ordered_assets){
  Check ((Sha $a.path) -eq $a.sha256 -and $a.path -eq $item.media_upload.local_path) "$($m.material_id) selected asset hash/order"
  Check (@($facts.asset_integrity|Where-Object {$_.path -eq $a.path -and $_.actual_sha256 -eq $a.sha256 -and $_.match -and $_.actually_viewed}).Count -eq 1) "$($m.material_id) factcheck viewed asset"
  Check (@($critic.materials.assets|Where-Object {$_.path -eq $a.path -and $_.sha256 -eq $a.sha256 -and $_.viewed}).Count -eq 1) "$($m.material_id) critic viewed asset"
  $image=[Drawing.Image]::FromFile((Join-Path $root $a.path))
  Check ($image.Width -eq 1080 -and $image.Height -eq 1350 -and (Get-Item -LiteralPath (Join-Path $root $a.path)).Length -eq $a.bytes -and $a.bytes -lt 10MB) "$($m.material_id) geometry/bytes"
  $image.Dispose()
 }
}
Check (@(Get-ChildItem -LiteralPath (Join-Path $root 'assets') -File -Recurse).Count -eq 3) 'exactly three included primary images'
foreach($file in Get-ChildItem -LiteralPath $root -File -Recurse|Where-Object Extension -in '.json','.md','.ps1','.txt'){
 $content=Get-Content -LiteralPath $file.FullName -Raw
 Check ($content -notmatch '(?i)[a-z]:[\\/](?:Users|home)[\\/]') "no machine-private path $($file.Name)"
}
$result=[ordered]@{pass=($failures.Count -eq 0);checks=$checks;failures=$failures.ToArray();scope='Compact local bundle integrity and exact review bindings only';accepted_local=3;primary_images=3;texts=3;original_reviewed_snapshot_sha256=$proof.original_snapshot.sha256;portable_snapshot_sha256=$proof.portable_snapshot.sha256;schedule_eligibility='NOT_EVALUATED';api_writes='NOT_RUN'}
$result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $root 'qa/portable-integrity.json') -Encoding utf8
$result|ConvertTo-Json -Depth 8
if($failures.Count){exit 1}
