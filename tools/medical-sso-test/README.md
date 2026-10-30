# Medical SSO Test Portal

This standalone page simulates an external medical system. It is not a public
registration or credential issuance service and must not be deployed to a public
web root. It uses the backend repository's `scripts/medical_sso_test_server.py`.

Run the server on lab loopback, with a private mode-600 JSON configuration outside
Git. Set the backend medical validation URL to that server's `/verify` endpoint.
The validation bearer secret and dashboard HMAC key must stay on the server.
Never enable the Spring mock controller on a public server.

Forward the loopback service to the workstation:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:5180:127.0.0.1:18086 70374090
```

Open `http://127.0.0.1:5180/`. Configure `testOrigins` to match the local portal
origin and `frontendOrigin` to match the running frontend. Test credentials expire
after ten minutes. Restarting the simulator revokes its outstanding external
tokens. Existing platform sessions still expire independently.

Use the actual published dashboard and allowlist its code in the backend. Copy its
base URL from Dashboard Management and paste it into the integration base address
field. The simulator accepts only that configured dashboard and frontend origin;
it rejects extra identity parameters, duplicate IDs and other destinations. Each
data source must have an explicit department field mapping. Unsupported sources
and warning widgets fail closed, never fall back to hospital-wide results.
The current acceptance identity is the existing employee account `300112`
(杜琴), with source department code `15` (骨科). The private simulator configuration
contains only this identity; the previous synthetic identities are no longer offered.
Before using an existing employee account, explicitly bind the verified external
subject to that account in `sys_medical_identity`; do not create another account or
change its password or roles. The external token verifier is still simulated.
Platform entry now signs employee number, display name, Unix timestamp and a random nonce
with the private `platformSigningKeyBase64` configuration, matching the API's
`IDMP_PLATFORM_SSO_KEY_BASE64`. This key must differ from the dashboard signing key.
It does not request an external token or call the external verifier. Its login link
expires after 120 seconds and is single-use. The employee account must already exist.
The resulting platform session lasts ten minutes and uses that user's configured platform roles.
Accounts without permissions see an authorization notice; SSO never assigns an
administrator role. Signed entry explicitly requests `entry: "DASHBOARD"` from
`/auth/sso/exchange` and remains restricted to department-isolated dashboards.
The exchange API defaults to `entry: "PLATFORM"` when omitted. Neither entry issues
refresh cookies. Dashboard sessions still expire with the external token.

The base URL contains only `dashboardID`, not the administrator's identity. The
external backend fills `doctorNo` and `deptCode` from its authenticated visitor and
computes HMAC-SHA256 server-side. The simulator performs token login followed by a
redirect to that signed `/dashboard` URL. It does not create or replace calculated
results. Real hospital chart data does not mean real external identity verification:
this portal still simulates the medical platform until its verification endpoint
is supplied. Loopback URLs are for local acceptance, not cross-system deployment.

Test platform entry, signed entry, invalid token, incorrect signature, department
isolation, and denied management API access. Remove the simulator and disable its integration
when replacing it with the real medical system.
