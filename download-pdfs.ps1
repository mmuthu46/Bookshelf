# =============================================================================
# download-pdfs.ps1
# Downloads 12 public-domain PDFs from Project Gutenberg into assets/pdfs/.
#
# RUN THIS FROM A NON-CORPORATE NETWORK (home Wi-Fi) to bypass Zscaler proxy.
#
# Usage (from the Bookshelf project root):
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\download-pdfs.ps1
# =============================================================================

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

$books = @(
    # Fiction
    @{ id=1342;  out="assets\pdfs\fiction\pride-and-prejudice.pdf";         title="Pride and Prejudice" },
    @{ id=345;   out="assets\pdfs\fiction\dracula.pdf";                     title="Dracula" },
    @{ id=1661;  out="assets\pdfs\fiction\adventures-of-sherlock-holmes.pdf"; title="Adventures of Sherlock Holmes" },
    # Non-Fiction
    @{ id=2680;  out="assets\pdfs\nonfiction\meditations.pdf";              title="Meditations" },
    @{ id=132;   out="assets\pdfs\nonfiction\art-of-war.pdf";               title="The Art of War" },
    @{ id=147;   out="assets\pdfs\nonfiction\common-sense.pdf";             title="Common Sense" },
    # Biography
    @{ id=148;   out="assets\pdfs\biography\autobiography-of-benjamin-franklin.pdf"; title="Autobiography of Benjamin Franklin" },
    @{ id=2376;  out="assets\pdfs\biography\up-from-slavery.pdf";           title="Up from Slavery" },
    @{ id=5253;  out="assets\pdfs\biography\story-of-my-life.pdf";          title="The Story of My Life" },
    # Self-Help
    @{ id=4507;  out="assets\pdfs\selfhelp\as-a-man-thinketh.pdf";         title="As a Man Thinketh" },
    @{ id=58585; out="assets\pdfs\selfhelp\the-prophet.pdf";               title="The Prophet" },
    @{ id=16643; out="assets\pdfs\selfhelp\self-reliance.pdf";             title="Self-Reliance" }
)

$ok = 0; $fail = 0

foreach ($b in $books) {
    # Skip if already a real PDF
    if (Test-Path $b.out) {
        $head = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($b.out)[0..3])
        if ($head -eq "%PDF") { Write-Host "SKIP  $($b.title) (already downloaded)"; $ok++; continue }
    }

    $urls = @(
        "https://www.gutenberg.org/cache/epub/$($b.id)/pg$($b.id).pdf",
        "https://www.gutenberg.org/files/$($b.id)/$($b.id)-pdf.pdf",
        "https://www.gutenberg.org/ebooks/$($b.id).pdf.noimages"
    )

    Write-Host "GET   $($b.title)..." -NoNewline
    $downloaded = $false

    foreach ($url in $urls) {
        try {
            Invoke-WebRequest -Uri $url -OutFile $b.out -UserAgent $ua -TimeoutSec 120 -ErrorAction Stop
            if (Test-Path $b.out) {
                $size = (Get-Item $b.out).Length
                $head = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($b.out)[0..3])
                if ($head -eq "%PDF" -and $size -gt 5000) {
                    Write-Host "  OK  $("{0:N0}" -f $size) bytes"
                    $ok++; $downloaded = $true; break
                }
            }
        } catch { }
    }

    if (-not $downloaded) {
        Write-Host "  FAIL  Manual download needed from: https://www.gutenberg.org/ebooks/$($b.id)"
        $fail++
    }
}

Write-Host ""
Write-Host "Done: $ok OK, $fail failed."
if ($fail -gt 0) {
    Write-Host "For failed books, visit their Gutenberg page and download the PDF manually into the correct assets/pdfs/ subfolder."
}
