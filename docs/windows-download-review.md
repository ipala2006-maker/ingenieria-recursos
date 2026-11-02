# Windows download review - 2026-11-02

## Verified

- Official HTTPS URL: https://estudiemos.estudiemos-services.workers.dev/downloads/Estudiemos-Para-Windows.exe
- Version: 2.1; 4,915,099 bytes.
- SHA-256: `254765004c7092d776a55fb98347882d9872dda6a4d16ee9ce920b5c89ffb940`.
- Published bytes match the local installer exactly.
- Local Microsoft Defender custom scan completed with no threats found. This is one engine at one point in time, not a guarantee or a Chrome review.
- Authenticode: NotSigned. No trusted publisher certificate is present.
- HTTPS returns 200 and an attachment header; this is not a mixed-HTTP download.

## Remaining provider-side limitation

The supplied Chrome screenshot reports an ongoing Safe Browsing scan, not a confirmed malware detection. Google also warns about unfamiliar binaries. Do not label this a false positive until a result actually flags the binary.

No app-side flag, checksum, renamed executable or self-signed certificate can clear Google's verdict. Do not disable Safe Browsing, exclude the binary from antivirus, or tell users to download a suspicious file. Preserve a stable official URL and do not rebuild the binary for cosmetic web-only changes.

If Google reports a harmful download, inspect its Security Issues report and request review of the exact URL and hash after correcting any finding. Do not submit user data or private credentials. A trusted publisher signature or an eligible Store-distributed MSIX are longer-term distribution options; neither is implemented or purchased by this change.

References:
- https://support.google.com/chrome/answer/6261569?hl=es
- https://developers.google.com/search/docs/monitor-debug/security/malware
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

## Maintenance

When deliberately replacing the Windows binary, regenerate its public `.sha256` companion and run `node --test tests/windows-download.test.js`. The hash proves file integrity, not absence of malware.

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\downloads\Estudiemos-Para-Windows.exe
Get-AuthenticodeSignature -LiteralPath .\downloads\Estudiemos-Para-Windows.exe
```
