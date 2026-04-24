# Set Vercel environment variables and redeploy
# Run: .\scripts\set-vercel-env.ps1

$envVars = @{
    "ENCRYPTION_KEY"             = "0bc9c2cc6d6296187b3796fa690d6da7f17c04531c6d7a98ecb91adb8e627691"
    "SUPABASE_URL"               = "https://czwiravsxqpfwvemultk.supabase.co"
    "SUPABASE_ANON_KEY"          = "sb_publishable_NdCmudPYnued9IoS7cn_lQ_gnSIY52-"
    "GEMINI_API_KEY"             = "AIzaSyDPi-KUT9QoSu8_kkQdY3iQ8e_Y6pcag_0"
    "LINE_CHANNEL_ACCESS_TOKEN"  = "zfoP/LPqRVYNpMybpz3jlN8vt8fP5N3vK5emSbTUe3PVcZJPKb2/4P2YY8FT11W1elPcjT3BrcFUtErH7VUHEV+s24jTexIFjz8aT/0AXZfd4WR/7ppUD2C6KewvS9tar/Tyv5kE8HHCm61lrjux9QdB04t89/1O/w1cDnyilFU="
    "LINE_CHANNEL_SECRET"        = "1415805033a67a302d0bccc16cea69c9"
    "LINE_USER_ID"               = "Uf9dadbe91c970a8b58350ca7272556ab"
    "X_API_KEY"                  = "K4XfQPyDcK3wvpQIwObdRZUBq"
    "X_API_SECRET"               = "kEuT428E4lF1o494xKoqmsj9R8tJPJY4bf9EU6TrAR9sbeAI1B"
    "X_ACCESS_TOKEN"             = "2046760326436466688-KVo76rh7QMywjBIzNg8NwdJySYnbJ7"
    "X_ACCESS_SECRET"            = "vh85BgWnN5gDMPhL4rbZMMY9R6ezfvel4qChEk7F7yhsa"
    "CRON_SECRET"                = "b4c9e8a7f1d23c6b9a8e7d6f5c4b3a2d"
}

foreach ($key in $envVars.Keys) {
    $value = $envVars[$key]
    Write-Host "Setting: $key ..." -ForegroundColor Cyan
    $value | npx vercel env add $key production  2>&1
    $value | npx vercel env add $key preview     2>&1
    $value | npx vercel env add $key development 2>&1
}

Write-Host ""
Write-Host "All env vars set! Starting redeploy..." -ForegroundColor Green
npx vercel --prod --yes 2>&1
