# Creator invite tokens

Minted 2026-10-21 with `npx tsx scripts/seed-creators.ts --env-file=.env`.
HMAC-signed with AUTH_SECRET, expire 2026-11-03 (14 days). One-time use per
creator; claiming again by the same account is safe, reassigning is refused.

Handling: this file is real invite material for the live site. Do not paste
tokens into public channels; send them one-to-one (DM or email). If a token
ever leaks, just re-run the mint script; fresh tokens invalidate nothing but
the old ones still work until expiry, so treat leaks by re-minting and
sending again.

To hand over: each creator signs in on https://scentcensus.com, goes
to /creator/claim, pastes their token. Their creator page flips to CLAIMED
the moment the form passes.

| Creator | Slug | Token |
| --- | --- | --- |
| Cal Cologne | cal-cologne | eyJjcmVhdG9ySWQiOiJjbXZmeHphNWswMDAweTg5MzdlamV3aTVpIiwiaXNzdWVkQXQiOjE3OTI1MjUwMjMzOTAsImV4cGlyZXNBdCI6MTc5MzczNDYyMzM5MCwibm9uY2UiOiIxZDVlZDg3Yi02MDAzLTQzNjctODdkNi1hMDhkNTI2NGQyMTcifQ.6zsZ7bLNjCtDIAWy1UTFOUchVlA0nRoF4TQ62EaKklM |
| Gents Scents | gents-scents | eyJjcmVhdG9ySWQiOiJjbXZmeHphYmYwMDAxeTg5M2R6Y2ZkNHF6IiwiaXNzdWVkQXQiOjE3OTI1MjUwMjM0NjEsImV4cGlyZXNBdCI6MTc5MzczNDYyMzQ2MSwibm9uY2UiOiI2ZTg4ZTU1NC1lNzQ5LTRlMjQtOGM3MC0xZTMwM2IwODNhOGIifQ.tuJKy62Jiw_fj4ekGusAVAvZuE1neGh9yJSqIpF-AZQ |
| Cuba Know | cuba-know | eyJjcmVhdG9ySWQiOiJjbXZmeHphZjgwMDAyeTg5M2N1a3QxZjUyIiwiaXNzdWVkQXQiOjE3OTI1MjUwMjM1MzMsImV4cGlyZXNBdCI6MTc5MzczNDYyMzUzMywibm9uY2UiOiJhZjUxNTdhOC1iOGNiLTQ0ODgtODdmMy05ZmYyODFlNmFiZjQifQ.SKG5EKHlKxaSZqBiJA3yXBYEqRxEIwFgGkqbqtl1VFI |
| FB Fragrances | fb-fragrances | eyJjcmVhdG9ySWQiOiJjbXZmeHphajYwMDAzeTg5M3RzejNtMnI5IiwiaXNzdWVkQXQiOjE3OTI1MjUwMjM2MDIsImV4cGlyZXNBdCI6MTc5MzczNDYyMzYwMiwibm9uY2UiOiJiZjFmZmY1MC05MTA0LTRiNjItYjQ1Ny01Y2NiMjQ3MmM1NmYifQ.adO7c22kl2Aov8M6A2kHVNO2xI9bsbGj14qx-8M2yFg |
| Top Frag | top-frag | eyJjcmVhdG9ySWQiOiJjbXZmeHphbjQwMDA0eTg5M255djc3cnlwIiwiaXNzdWVkQXQiOjE3OTI1MjUwMjM2NzIsImV4cGlyZXNBdCI6MTc5MzczNDYyMzY3Miwibm9uY2UiOiJmZjkxNDEyNC0yZWM4LTQ4ZmYtODkwYi03N2RjZWVlYTkxY2QifQ.pUPW-ICwRihlPesl7r3QkRV9nJvJx8PVmeRN6NlLUl8 |
| Fragrance Flan | fragrance-flan | eyJjcmVhdG9ySWQiOiJjbXZmeHphcmEwMDA1eTg5M2prYThscWx2IiwiaXNzdWVkQXQiOjE3OTI1MjUwMjM3NDMsImV4cGlyZXNBdCI6MTc5MzczNDYyMzc0Mywibm9uY2UiOiJkNjVhZTU0Zi00MjliLTQ3NjgtODYxYi1lYTViY2I2NjQ0MDkifQ.fsBtsIHkbVEz1zdDZGui8cN3hN1w5AlOvODRYG6zbzE |

Secret-matching note: production AUTH_SECRET was reset on 2026-10-21 to match
the local .env value, so these locally minted tokens verify against the live
site. Existing production sessions were invalidated by that change; signing
in again is the only repair.

## DM template (updated 2026-10-25 for the scent-match-only site)

Send one-to-one only. Never paste the token publicly. The site now shows the
computed scent match, not imported closeness percentages, so the template
mirrors that display.

    Hey [name]. I built Scent Census, scentcensus.com. It ranks clones
    by a computed scent match from public note and accord lists, and people
    who own both bottles vote on how close the pair is.

    The reason I built it now: German courts ruled against dupe sellers, the
    top civil court settled the principle in April 2025, and more rulings
    landed through October 2026. TikTok blocked #designerdupe. The "smells
    like" sentence, the one line a clone review stands on, is the part that
    disappears first when platforms strike it.

    This site keeps the pair and the date, and labels every source. No
    platform owns the record here. Your clips stay yours; the receipt stays
    public.

    Claiming is one token, one tap. Rules for the record: no fan pages, no
    paid ranking. Your page only unlocks what you already published in the
    wild.

    Claim here: https://scentcensus.com/creator/claim
    One-time token: [TOKEN]
    It expires November 3.

    If you want the honest read first:
    https://scentcensus.com/fragrance/imagination-67370

Facts used, all verified: the German rulings (final April 2025, further wins
through October 2026) and the #designerdupe block. Site copy never names the
reporting house or plaintiff names. Creator-report ban claims (single-source
Skool talk) are left out of DMs and site copy entirely.
